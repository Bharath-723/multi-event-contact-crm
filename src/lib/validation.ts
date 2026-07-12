import { z } from 'zod';

export const ALLOWED_AREAS = [
  'Kokapet',
  'Gandipet',
  'Narsingi',
  'Aziz Nagar',
  'Moinabad',
  'Banjara Hills'
] as const;

export const registrationSchema = z.object({
  fullName: z.string()
    .min(2, 'Name must be at least 2 characters')
    .max(100, 'Name must be less than 100 characters')
    .regex(/^[a-zA-Z\s.-]+$/, 'Name can only contain letters, spaces, dots, and hyphens')
    .trim(),
  phone: z.string()
    .length(10, 'Phone number must be exactly 10 digits')
    .regex(/^[0-9]+$/, 'Phone number must contain only numbers'),
  age: z.coerce.number()
    .int('Age must be an integer')
    .min(10, 'Age must be at least 10')
    .max(100, 'Age cannot exceed 100'),
  gender: z.enum(['Male', 'Female'], {
    message: 'Please select a gender',
  }),
  occupation: z.string().optional().or(z.literal('')),
  areaOfStay: z.string().optional().or(z.literal('')),
  companyCollege: z.string()
    .min(2, 'Company/College name must be at least 2 characters')
    .max(120, 'Company/College name must be less than 120 characters')
    .trim(),
  pgName: z.string().optional().or(z.literal('')),
  skills: z.array(z.string()),
  interestedToVolunteer: z.enum(['Yes', 'No'], {
    message: 'Please select a volunteering preference',
  }),
  volunteerSlotId: z.string().optional().or(z.literal('')),
  interestedToDinner: z.enum(['Yes', 'No'], {
    message: 'Please select a dinner preference',
  }),
  wantsToDonate: z.enum(['Yes', 'No'], {
    message: 'Please select a donation preference',
  }),
  transportationRequired: z.enum(['Yes', 'No'], {
    message: 'Please select a transportation preference',
  }).optional().or(z.literal('')),
}).superRefine((data, ctx) => {
  // If gender is Male, areaOfStay is required
  if (data.gender === 'Male' && (!data.areaOfStay || data.areaOfStay.trim() === '')) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Area of Stay is required',
      path: ['areaOfStay'],
    });
  }

  // If gender is Male, transportationRequired is required
  if (data.gender === 'Male' && (!data.transportationRequired || data.transportationRequired.trim() === '')) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Please select a transportation preference',
      path: ['transportationRequired'],
    });
  }

  // If interestedToVolunteer is Yes, volunteerSlotId is required
  if (data.interestedToVolunteer === 'Yes' && (!data.volunteerSlotId || data.volunteerSlotId.trim() === '')) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Please select a volunteer time slot',
      path: ['volunteerSlotId'],
    });
  }
});

export type RegistrationFormInput = z.infer<typeof registrationSchema>;
export type RegistrationSchemaInput = z.input<typeof registrationSchema>;
export type RegistrationFormRaw = Omit<RegistrationFormInput, 'age'> & { age: string };
