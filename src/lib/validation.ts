import { z } from 'zod';
import { isPrasadamAllowedForSlot } from './constants/prasadam-rules';

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
  volunteerSlotTime: z.string().optional().or(z.literal('')),
  interestedToDinner: z.enum(['Yes', 'No'], {
    message: 'Please select a prasadam preference',
  }),
  prasadamSelections: z.array(z.enum(['Breakfast', 'Lunch', 'Dinner'])).optional().default([]),
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

  // A. Volunteer = Yes
  if (data.interestedToVolunteer === 'Yes') {
    if (!data.volunteerSlotId || data.volunteerSlotId.trim() === '') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Please select a volunteer time slot',
        path: ['volunteerSlotId'],
      });
    }

    if (data.interestedToDinner === 'Yes') {
      const selections = data.prasadamSelections ?? [];

      if (!data.volunteerSlotTime || data.volunteerSlotTime.trim() === '') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Please select a volunteer time slot above to view available prasadam options',
          path: ['prasadamSelections'],
        });
        return;
      }

      if (selections.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Please select at least one prasadam option',
          path: ['prasadamSelections'],
        });
        return;
      }

      for (const meal of selections) {
        if (!isPrasadamAllowedForSlot(data.volunteerSlotTime, meal)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `${meal} is not available for the selected time slot (${data.volunteerSlotTime})`,
            path: ['prasadamSelections'],
          });
        }
      }
    }
  }

  // B. Volunteer = No
  if (data.interestedToVolunteer === 'No') {
    if (data.interestedToDinner === 'Yes') {
      const selections = data.prasadamSelections ?? [];
      if (selections.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Please select at least one prasadam option',
          path: ['prasadamSelections'],
        });
      }
      // Any combination of Breakfast, Lunch, Dinner is valid when Volunteer = No
    }
  }

  // C. Prasadam = No
  if (data.interestedToDinner === 'No') {
    const selections = data.prasadamSelections ?? [];
    if (selections.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Prasadam selections must be empty when prasadam interest is No',
        path: ['prasadamSelections'],
      });
    }
  }
});

export type RegistrationFormInput = z.infer<typeof registrationSchema>;
export type RegistrationSchemaInput = z.input<typeof registrationSchema>;
export type RegistrationFormRaw = Omit<RegistrationFormInput, 'age'> & { age: string };

// --- FEEDBACK REGISTRATION SCHEMA (v2.0.0) ---
export const feedbackSchema = z.object({
  fullName: z.string()
    .min(2, 'Full Name must be at least 2 characters')
    .max(100, 'Full Name must be less than 100 characters')
    .regex(/^[a-zA-Z\s.-]+$/, 'Name can only contain letters, spaces, dots, and hyphens')
    .trim(),
  phone: z.string()
    .length(10, 'Phone number must be exactly 10 digits')
    .regex(/^[0-9]+$/, 'Phone number must contain only numbers'),
  collegeName: z.string({
    message: 'Please select a college',
  }).min(1, 'Please select a college').trim(),
  customCollegeName: z.string().optional(),
  branch: z.enum(['CSE', 'ECE', 'EEE', 'Mechanical', 'Civil'], {
    message: 'Please select a branch',
  }),
  gender: z.enum(['Male', 'Female'], {
    message: 'Please select a gender',
  }),
  currentStay: z.enum(['With Parents', 'In Hostel'], {
    message: 'Please select your current stay',
  }),
  skills: z.array(z.string()).optional().default([]),
  feedback: z.enum(['Excellent', 'Good', 'Not Applicable'], {
    message: 'Please select feedback rating',
  }),
  interestedOnlineWork: z.enum(['Yes', 'No'], {
    message: 'Please select your interest in online workshop',
  }),
}).superRefine((data, ctx) => {
  if (data.collegeName === 'Other') {
    if (!data.customCollegeName || data.customCollegeName.trim() === '') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Please enter your college name',
        path: ['customCollegeName'],
      });
    } else if (data.customCollegeName.trim().length < 2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'College name must be at least 2 characters',
        path: ['customCollegeName'],
      });
    }
  }
});

export type FeedbackFormInput = z.infer<typeof feedbackSchema>;
export type FeedbackSchemaInput = z.input<typeof feedbackSchema>;
