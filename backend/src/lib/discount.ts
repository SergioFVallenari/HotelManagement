import { badRequest, forbidden } from './AppError.js';
import { round2 } from './money.js';

export type Discount = { type: 'PERCENTAGE' | 'FIXED'; value: number };

export function assertDiscountPermission(discount: Discount | null | undefined, role?: string) {
  if (discount && role !== 'ADMIN' && role !== 'OWNER') {
    throw forbidden('Solo un administrador o propietario puede aplicar descuentos');
  }
}

export function calculateDiscount(subtotal: number, discount?: Discount | null) {
  if (!discount) return { discountAmount: 0, total: round2(subtotal) };
  const { type, value } = discount;
  if (!Number.isFinite(value) || value < 0 || (type !== 'PERCENTAGE' && type !== 'FIXED') || (type === 'PERCENTAGE' && value > 100) || (type === 'FIXED' && round2(value) > round2(subtotal))) {
    throw badRequest('El descuento debe estar entre 0 y 100% o no superar el subtotal');
  }
  const discountAmount = round2(type === 'PERCENTAGE' ? subtotal * value / 100 : value);
  return { discountAmount, total: round2(subtotal - discountAmount) };
}
