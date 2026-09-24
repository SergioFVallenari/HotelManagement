FROM public.ecr.aws/docker/library/node:22
COPY --from=public.ecr.aws/awsguru/aws-lambda-adapter:1.0.1 /lambda-adapter /opt/extensions/lambda-adapter
ENV NODE_ENV=production
ENV PORT=8080
ENV READINESS_CHECK_PATH=/health
WORKDIR /var/task
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN node -e "const fs=require('fs');const p='package.json';const j=JSON.parse(fs.readFileSync(p));delete j.devEngines;fs.writeFileSync(p,JSON.stringify(j,null,2))" \
  && corepack enable && corepack prepare pnpm@11.9.0 --activate \
  && pnpm install --prod --frozen-lockfile
COPY dist ./dist
CMD ["node", "dist/server.js"]