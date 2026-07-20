/**
 * Valida cédula de identidad ecuatoriana (10 dígitos, algoritmo módulo 10).
 */
export function isValidEcuadorianCedula(value: string): boolean {
  const cedula = value.trim();
  if (!/^\d{10}$/.test(cedula)) return false;

  const province = Number(cedula.slice(0, 2));
  if ((province < 1 || province > 24) && province !== 30) return false;

  const third = Number(cedula[2]);
  if (third < 0 || third > 5) return false;

  const coefficients = [2, 1, 2, 1, 2, 1, 2, 1, 2];
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    let product = Number(cedula[i]) * coefficients[i];
    if (product >= 10) product -= 9;
    sum += product;
  }

  const check = (10 - (sum % 10)) % 10;
  return check === Number(cedula[9]);
}
