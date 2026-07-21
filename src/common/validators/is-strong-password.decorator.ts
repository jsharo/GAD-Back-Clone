import { applyDecorators } from '@nestjs/common';
import { Matches, MinLength, ValidationOptions } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** Min 8 chars, upper, lower, digit, and special character. */
export const PASSWORD_COMPLEXITY_REGEX =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;

export const PASSWORD_COMPLEXITY_MESSAGE =
  'Password must be at least 8 characters and include uppercase, lowercase, a number and a special character';

/** Required password field with complexity rules. */
export function IsStrongPassword(validationOptions?: ValidationOptions) {
  return applyDecorators(
    MinLength(8, validationOptions),
    Matches(PASSWORD_COMPLEXITY_REGEX, {
      message: PASSWORD_COMPLEXITY_MESSAGE,
      ...validationOptions,
    }),
  );
}

export function StrongPasswordApiProperty(required = true) {
  const opts = {
    minLength: 8,
    example: 'Demo1234!',
    description: PASSWORD_COMPLEXITY_MESSAGE,
  };
  return required ? ApiProperty(opts) : ApiPropertyOptional(opts);
}
