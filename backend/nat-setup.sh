#!/usr/bin/env bash
# Configuracion ONE-TIME de la salida a internet para la Lambda.
#
# Por que: una Lambda VPC-attached no tiene IP publica en sus ENIs, asi que la
# ruta 0.0.0.0/0 hacia el IGW no le sirve. Sin NAT no puede llamar a
# api.mercadopago.com (UNDC_ERR_CONNECT_TIMEOUT). Este script crea una t3.micro
# que hace de NAT en una subnet publica y enruta las subnets de la app hacia ella.
#
# Es idempotente: se puede volver a correr sin duplicar recursos.
# OJO: el target de la ruta privada es el ENI de la instancia. Si reemplazas la
# instancia NAT, volve a correr este script para apuntar la ruta al ENI nuevo.

set -euo pipefail

REGION="us-east-2"
FUNCTION="gestion-hotel-backend"
AZ="us-east-2a"
NAT_NAME="hotel-nat"
NAT_INSTANCE_TYPE="t3.micro"
NAT_SUBNET_CIDR="172.31.48.0/20"
KEY_PAIR="$NAT_NAME"

command -v aws >/dev/null 2>&1 || { echo "Falta: aws"; exit 1; }

# --- Descubrimiento: todo sale de la Lambda, nada hardcodeado ---------------
VPC_ID="$(aws lambda get-function-configuration \
  --function-name "$FUNCTION" --region "$REGION" \
  --query 'VpcConfig.VpcId' --output text)"

APP_SUBNETS="$(aws lambda get-function-configuration \
  --function-name "$FUNCTION" --region "$REGION" \
  --query 'VpcConfig.SubnetIds[]' --output text)"

if [ -z "$VPC_ID" ]; then
  echo "La Lambda no esta VPC-attached, no hace falta NAT. Saliendo."
  exit 0
fi

IN_USE="$(aws ec2 describe-subnets --region "$REGION" \
  --filters "Name=vpc-id,Values=$VPC_ID" \
  --query 'join(`\n`, Subnets[].CidrBlock)' --output text)"

echo "== VPC $VPC_ID =="
echo "   subnets de la app:"
echo "$APP_SUBNETS" | sed 's/^/     /'
echo "   cidrs en uso:"
echo "$IN_USE" | sed 's/^/     /'

IGW_ID="$(aws ec2 describe-internet-gateways --region "$REGION" \
  --filters "Name=attachment.vpc-id,Values=$VPC_ID" \
  --query 'InternetGateways[0].InternetGatewayId' --output text)"

# --- 1. Subnet publica para la NAT ------------------------------------------
SUBNET_ID="$(aws ec2 describe-subnets --region "$REGION" \
  --filters "Name=vpc-id,Values=$VPC_ID" "Name=cidr-block,Values=$NAT_SUBNET_CIDR" \
  --query 'Subnets[0].SubnetId' --output text)"

if [ -z "$SUBNET_ID" ] || [ "$SUBNET_ID" = "None" ]; then
  echo "== subnet publica para la NAT ($NAT_SUBNET_CIDR en $AZ) =="
  SUBNET_ID="$(aws ec2 create-subnet --region "$REGION" \
    --vpc-id "$VPC_ID" \
    --cidr-block "$NAT_SUBNET_CIDR" \
    --availability-zone "$AZ" \
    --tag-specifications "ResourceType=subnet,Tags=[{Key=Name,Value=$NAT_NAME-public},{Key=Project,Value=gestion-hotel}]" \
    --query SubnetId --output text)"
else
  echo "Subnet publica ya existe: $SUBNET_ID"
fi

# create-subnet no acepta el flag, se setea aparte. Idempotente.
aws ec2 modify-subnet-attribute --region "$REGION" \
  --subnet-id "$SUBNET_ID" --map-public-ip-on-launch >/dev/null

# --- 2. Route table publica (salida por IGW) ---------------------------------
RTB_PUBLIC="$(aws ec2 describe-route-tables --region "$REGION" \
  --filters "Name=vpc-id,Values=$VPC_ID" "Name=tag:Name,Values=$NAT_NAME-public" \
  --query 'RouteTables[0].RouteTableId' --output text)"

if [ -z "$RTB_PUBLIC" ] || [ "$RTB_PUBLIC" = "None" ]; then
  echo "== route table publica =="
  # OJO: create-route-table anida la respuesta en RouteTable, no es plano.
  RTB_PUBLIC="$(aws ec2 create-route-table --region "$REGION" \
    --vpc-id "$VPC_ID" \
    --tag-specifications "ResourceType=route-table,Tags=[{Key=Name,Value=$NAT_NAME-public},{Key=Project,Value=gestion-hotel}]" \
    --query 'RouteTable.RouteTableId' --output text)"
fi

aws ec2 associate-route-table --region "$REGION" \
  --route-table-id "$RTB_PUBLIC" --subnet-id "$SUBNET_ID" >/dev/null

CURRENT_PUBLIC="$(aws ec2 describe-route-tables --region "$REGION" \
  --route-table-ids "$RTB_PUBLIC" \
  --query 'RouteTables[0].Routes[?DestinationCidrBlock==`0.0.0.0/0`].GatewayId|[0]' \
  --output text)"

if [ "$CURRENT_PUBLIC" = "$IGW_ID" ]; then
  echo "Ruta publica 0.0.0.0/0 -> $IGW_ID ya existe."
else
  echo "== ruta publica 0.0.0.0/0 -> IGW =="
  aws ec2 replace-route --region "$REGION" \
    --route-table-id "$RTB_PUBLIC" \
    --destination-cidr-block 0.0.0.0/0 \
    --gateway-id "$IGW_ID" 2>/dev/null \
  || aws ec2 create-route --region "$REGION" \
    --route-table-id "$RTB_PUBLIC" \
    --destination-cidr-block 0.0.0.0/0 \
    --gateway-id "$IGW_ID"
fi

# --- 3. Elastic IP + key pair + SG ------------------------------------------
EIP_ID="$(aws ec2 describe-addresses --region "$REGION" \
  --filters "Name=tag:Name,Values=$NAT_NAME" \
  --query 'Addresses[0].AllocationId' --output text)"

if [ -z "$EIP_ID" ] || [ "$EIP_ID" = "None" ]; then
  echo "== elastic IP =="
  EIP_ID="$(aws ec2 allocate-address --region "$REGION" --domain vpc \
    --tag-specifications "ResourceType=elastic-ip,Tags=[{Key=Name,Value=$NAT_NAME},{Key=Project,Value=gestion-hotel}]" \
    --query AllocationId --output text)"
else
  echo "EIP ya existe: $EIP_ID"
fi

KEY_FILE="${HOME}/.ssh/${KEY_PAIR}.pem"

if ! aws ec2 describe-key-pairs --region "$REGION" --key-name "$KEY_PAIR" >/dev/null 2>&1; then
  echo "== key pair (para poder entrar por SSH a diagnosticar) =="
  if [ -f "$KEY_FILE" ]; then
    echo "ERROR: ya existe $KEY_FILE pero el key pair no existe en AWS." >&2
    echo "       Borra el archivo o renombralo y volve a correr el script." >&2
    exit 1
  fi
  mkdir -p "${HOME}/.ssh"
  aws ec2 create-key-pair --region "$REGION" --key-name "$KEY_PAIR" \
    --query KeyMaterial --output text > "$KEY_FILE"
  chmod 600 "$KEY_FILE"
  echo "   clave privada guardada en $KEY_FILE"
else
  echo "Key pair ya existe: $KEY_PAIR"
fi

SG_NAT="$(aws ec2 describe-security-groups --region "$REGION" \
  --filters "Name=vpc-id,Values=$VPC_ID" "Name=group-name,Values=$NAT_NAME-sg" \
  --query 'SecurityGroups[0].GroupId' --output text)"

if [ -z "$SG_NAT" ] || [ "$SG_NAT" = "None" ]; then
  echo "== security group de la NAT =="
  SG_NAT="$(aws ec2 create-security-group --region "$REGION" \
    --group-name "$NAT_NAME-sg" \
    --description "NAT del backend gestionHotel" \
    --vpc-id "$VPC_ID" \
    --tag-specifications "ResourceType=security-group,Tags=[{Key=Name,Value=$NAT_NAME-sg},{Key=Project,Value=gestion-hotel}]" \
    --query GroupId --output text)"
fi

# SSH: reconciliar con la IP publica actual. Va FUERA del bloque de creacion del
# SG a proposito: la IP de casa cambia (ISP dinamico) y antes la regla solo se
# agregaba al crear el SG. Como el resto del script es idempotente, volver a
# correrlo nunca actualizaba la IP y `ssh` se quedaba en timeout para siempre.
# Se agrega la actual si falta; las /32 viejas se reportan pero NO se borran
# solas, por si laburas con mas de una maquina.
echo "== SSH: IP publica actual =="

MY_IP="$(curl -fsS --max-time 10 https://checkip.amazonaws.com 2>/dev/null || true)"

if [[ ! "$MY_IP" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  # Si no se puede detectar, NO se abre el puerto 22 a todo internet para
  # debuggear: no lo justifica.
  echo "   No se pudo detectar tu IP publica: no se abrio el puerto 22."
  echo "   Para entrar a la NAT, agregala a mano cuando la necesites."
else
  SSH_CIDRS="$(aws ec2 describe-security-groups --region "$REGION" --group-ids "$SG_NAT" \
    --query 'SecurityGroups[0].IpPermissions[?FromPort==`22` && IpProtocol==`tcp`].IpRanges[].CidrIp' \
    --output text | tr '\t' '\n' | grep -v '^$' || true)"

  FOUND=0
  STALE=""
  while IFS= read -r cidr; do
    [ -z "$cidr" ] && continue
    if [ "$cidr" = "$MY_IP/32" ]; then FOUND=1; else STALE="$STALE $cidr"; fi
  done <<< "$SSH_CIDRS"

  if [ "$FOUND" = "1" ]; then
    echo "   SSH 22 ya permitido desde $MY_IP."
  else
    echo "   abriendo SSH 22 desde $MY_IP"
    # OJO: la forma corta (--protocol/--port/--cidr) NO acepta --description y
    # falla con "Unknown options". Para dejar la descripcion hay que usar
    # --ip-permissions, y ahi el valor va sin espacios.
    aws ec2 authorize-security-group-ingress --region "$REGION" \
      --group-id "$SG_NAT" \
      --ip-permissions "IpProtocol=tcp,FromPort=22,ToPort=22,IpRanges=[{CidrIp=$MY_IP/32,Description=SSH-IP-actual}]" >/dev/null
  fi

  if [ -n "$STALE" ]; then
    echo "   OJO: reglas de 22 que NO son tu IP actual (puede ser otra maquina):"
    echo "$STALE" | tr ' ' '\n' | sed 's/^/     /'
    echo "   para borrar una:"
    echo "     aws ec2 revoke-security-group-ingress --region $REGION --group-id $SG_NAT --protocol tcp --port 22 --cidr <CIDR>"
  fi
fi

# OBLIGATORIO: la Lambda abre la conexion ENTRANDO a la NAT (destino = IP privada
# de la NAT), asi que sin esta regla el SG la dropea antes de que iptables pueda
# hacer NAT. Los SG son stateful, asi que la vuelta se permite sola.
# Hoy la app solo habla con MercadoPago por HTTPS. Si mas adelante necesita otro
# puerto, agregalo aca:
#   aws ec2 authorize-security-group-ingress --region "$REGION" --group-id "$SG_NAT" \
#     --protocol tcp --port <PUERTO> --cidr "$VPC_CIDR"
VPC_CIDR="$(aws ec2 describe-vpcs --region "$REGION" \
  --filters "Name=vpc-id,Values=$VPC_ID" \
  --query 'Vpcs[0].CidrBlock' --output text)"

if aws ec2 describe-security-groups --region "$REGION" --group-ids "$SG_NAT" \
  --query "SecurityGroups[0].IpPermissions[?FromPort==\`443\` && IpProtocol==\`tcp\`].IpRanges[0].CidrIp | [0]" \
  --output text | grep -q "^$VPC_CIDR$"; then
  echo "Regla 443 desde $VPC_CIDR ya existe."
else
  echo "== permitir trafico reenviado (443 desde $VPC_CIDR) =="
  aws ec2 authorize-security-group-ingress --region "$REGION" \
    --group-id "$SG_NAT" --protocol tcp --port 443 --cidr "$VPC_CIDR" >/dev/null
fi

# --- 4. Instancia NAT -------------------------------------------------------
# --no-source-dest-check es OBLIGATORIO: los clientes de la VPC le mandan
# paquetes con source distinto de la IP de la instancia, y con el check activo
# el kernel los descarta antes de que iptables pueda hacer NAT.
read -r -d '' USER_DATA <<'EOF' || true
#!/usr/bin/env bash
set -euo pipefail

# AL2023 no trae iptables. El paquete se llama iptables-nft, no "iptables":
# el comando /usr/sbin/iptables viene de ahi.
dnf install -y iptables-nft

cat >/usr/local/sbin/nat-setup.sh <<'INNER'
#!/usr/bin/env bash
set -euo pipefail
# systemd corre con un PATH minimo, sin esto no encuentra /usr/sbin/iptables.
export PATH=/usr/local/sbin:/usr/sbin:/sbin:/usr/bin:/bin
echo "net.ipv4.ip_forward = 1" >/etc/sysctl.d/99-nat.conf
sysctl -p /etc/sysctl.d/99-nat.conf >/dev/null
iptables -t nat -C POSTROUTING ! -o lo -j MASQUERADE 2>/dev/null \
  || iptables -t nat -A POSTROUTING ! -o lo -j MASQUERADE
# Si la regla no quedo puesta, fallar aca y no dejar una NAT muda que tira
# timeout sin que se note por que.
iptables -t nat -C POSTROUTING ! -o lo -j MASQUERADE
INNER

chmod +x /usr/local/sbin/nat-setup.sh
/usr/local/sbin/nat-setup.sh

cat >/etc/systemd/system/nat-setup.service <<'UNIT'
[Unit]
Description=NAT de la Lambda de gestionHotel
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=/usr/local/sbin/nat-setup.sh

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable nat-setup.service
EOF

# Solo instancias vivas: una terminada sigue apareciendo un rato y rompe el flujo.
NAT_INSTANCE_ID="$(aws ec2 describe-instances --region "$REGION" \
  --filters "Name=tag:Name,Values=$NAT_NAME" \
            "Name=instance-state-name,Values=pending,running,stopping,stopped" \
  --query 'Reservations[0].Instances[0].InstanceId' --output text)"

if [ -z "$NAT_INSTANCE_ID" ] || [ "$NAT_INSTANCE_ID" = "None" ]; then
  AMI_ID="$(aws ec2 describe-images --region "$REGION" --owners amazon \
    --filters 'Name=name,Values=al2023-ami-2023*-x86_64' \
    --query 'sort_by(Images,&CreationDate)[-1].ImageId' --output text)"

  echo "== instancia NAT ($NAT_INSTANCE_TYPE, AMI $AMI_ID) =="
  NAT_INSTANCE_ID="$(aws ec2 run-instances --region "$REGION" \
    --image-id "$AMI_ID" \
    --instance-type "$NAT_INSTANCE_TYPE" \
    --subnet-id "$SUBNET_ID" \
    --security-group-ids "$SG_NAT" \
    --key-name "$KEY_PAIR" \
    --user-data "$USER_DATA" \
    --metadata-options 'HttpTokens=required' \
    --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=$NAT_NAME},{Key=Project,Value=gestion-hotel}]" \
    --query Instances[0].InstanceId --output text)"
else
  STATE="$(aws ec2 describe-instances --region "$REGION" \
    --instance-ids "$NAT_INSTANCE_ID" \
    --query 'Reservations[0].Instances[0].State.Name' --output text)"
  echo "Instancia NAT ya existe: $NAT_INSTANCE_ID (estado: $STATE)"
fi

# run-instances no acepta source-dest-check: se setea despues de crear.
# Es OBLIGATORIO: los clientes de la VPC mandan paquetes con source distinto de
# la IP de la instancia, y con el check activo el kernel los descarta antes de
# que iptables pueda hacer NAT.
aws ec2 modify-instance-attribute --region "$REGION" \
  --instance-id "$NAT_INSTANCE_ID" --no-source-dest-check >/dev/null

# Si se reemplaza la instancia, la ruta queda apuntando a un ENI fantasma.
aws ec2 modify-instance-attribute --region "$REGION" \
  --instance-id "$NAT_INSTANCE_ID" --disable-api-termination >/dev/null

aws ec2 wait instance-running --region "$REGION" --instance-ids "$NAT_INSTANCE_ID"
aws ec2 wait instance-status-ok --region "$REGION" --instance-ids "$NAT_INSTANCE_ID"

aws ec2 associate-address --region "$REGION" \
  --instance-id "$NAT_INSTANCE_ID" --allocation-id "$EIP_ID" >/dev/null 2>&1 \
  || echo "   (la EIP ya estaba asociada)"

EIP_PUBLIC="$(aws ec2 describe-addresses --region "$REGION" \
  --allocation-ids "$EIP_ID" --query 'Addresses[0].PublicIp' --output text)"

# El user-data corre en el primer boot: le damos margen antes de dar por bueno.
echo "   esperando que el user-data configure el NAT..."
sleep 20

# --- 5. Route table privada: las subnets de la app salen por la NAT ----------
# OJO: no filtrar por Description, las AMI nuevas (AL2023) la dejan vacia.
NAT_ENI="$(aws ec2 describe-network-interfaces --region "$REGION" \
  --filters "Name=attachment.instance-id,Values=$NAT_INSTANCE_ID" \
  --query 'NetworkInterfaces[0].NetworkInterfaceId' --output text)"

if [ -z "$NAT_ENI" ] || [ "$NAT_ENI" = "None" ]; then
  echo "No se encontro el ENI de $NAT_INSTANCE_ID. Revisa la instancia." >&2
  exit 1
fi

RTB_PRIVATE="$(aws ec2 describe-route-tables --region "$REGION" \
  --filters "Name=vpc-id,Values=$VPC_ID" "Name=tag:Name,Values=$NAT_NAME-private" \
  --query 'RouteTables[0].RouteTableId' --output text)"

if [ -z "$RTB_PRIVATE" ] || [ "$RTB_PRIVATE" = "None" ]; then
  echo "== route table privada =="
  RTB_PRIVATE="$(aws ec2 create-route-table --region "$REGION" \
    --vpc-id "$VPC_ID" \
    --tag-specifications "ResourceType=route-table,Tags=[{Key=Name,Value=$NAT_NAME-private},{Key=Project,Value=gestion-hotel}]" \
    --query 'RouteTable.RouteTableId' --output text)"
fi

for SUBNET in $APP_SUBNETS; do
  aws ec2 associate-route-table --region "$REGION" \
    --route-table-id "$RTB_PRIVATE" --subnet-id "$SUBNET" >/dev/null
  echo "   $SUBNET -> $RTB_PRIVATE"
done

CURRENT_PRIVATE="$(aws ec2 describe-route-tables --region "$REGION" \
  --route-table-ids "$RTB_PRIVATE" \
  --query 'RouteTables[0].Routes[?DestinationCidrBlock==`0.0.0.0/0`].NetworkInterfaceId|[0]' \
  --output text)"

if [ "$CURRENT_PRIVATE" = "$NAT_ENI" ]; then
  echo "Ruta privada 0.0.0.0/0 -> $NAT_ENI ya existe."
else
  echo "== ruta privada 0.0.0.0/0 -> NAT =="
  aws ec2 replace-route --region "$REGION" \
    --route-table-id "$RTB_PRIVATE" \
    --destination-cidr-block 0.0.0.0/0 \
    --network-interface-id "$NAT_ENI" 2>/dev/null \
  || aws ec2 create-route --region "$REGION" \
    --route-table-id "$RTB_PRIVATE" \
    --destination-cidr-block 0.0.0.0/0 \
    --network-interface-id "$NAT_ENI" \
  || {
    echo "ERROR: no se pudo apuntar la ruta al ENI $NAT_ENI." >&2
    echo "       Borrala a mano y volve a correr este script:" >&2
    echo "       aws ec2 delete-route --route-table-id $RTB_PRIVATE --destination-cidr-block 0.0.0.0/0 --region $REGION" >&2
    exit 1
  }
fi

echo
echo "== listo =="
echo "   instancia NAT  : $NAT_INSTANCE_ID   IP publica $EIP_PUBLIC"
echo "   subnet publica  : $SUBNET_ID ($NAT_SUBNET_CIDR, $AZ)"
echo "   route publica   : $RTB_PUBLIC -> $IGW_ID"
echo "   route privada   : $RTB_PRIVATE -> $NAT_ENI"
echo "   sg NAT          : $SG_NAT"
echo
echo "Verificacion (deberia responder un codigo HTTP, no cortar):"
echo "  ssh -i $KEY_FILE ec2-user@$EIP_PUBLIC \\"
echo "    'curl -sS -o /dev/null -w \"%{http_code}\n\" https://api.mercadopago.com'"
