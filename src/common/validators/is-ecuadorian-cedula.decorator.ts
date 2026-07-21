import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { isValidEcuadorianCedula } from '../utils/cedula.util';

@ValidatorConstraint({ name: 'isEcuadorianCedula', async: false })
export class IsEcuadorianCedulaConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (value === undefined || value === null || value === '') return true;
    if (typeof value !== 'string') return false;
    return isValidEcuadorianCedula(value);
  }

  defaultMessage(): string {
    return 'La cédula no es válida. Debe ser un número de identidad ecuatoriano real.';
  }
}

export function IsEcuadorianCedula(validationOptions?: ValidationOptions) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsEcuadorianCedulaConstraint,
    });
  };
}
