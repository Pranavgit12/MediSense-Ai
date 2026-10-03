import type { SymptomQuestion } from '../types/medical';

/**
 * Validate an answer against the question shape. Kept separate from the
 * server-side symptom question registry so client forms don't bundle all
 * clinician-authored question sets.
 */
export function validateAnswer(question: SymptomQuestion, value: string): string | null {
  const allowed = question.options.map((option) => option.value);

  switch (question.kind) {
    case 'boolean':
    case 'single_choice':
      return allowed.includes(value) ? null : 'Choose one of the given answers.';

    case 'multi_choice': {
      const picked = value.split(',').map((item) => item.trim()).filter(Boolean);
      if (!picked.length) return 'Choose at least one option.';
      return picked.every((item) => allowed.includes(item))
        ? null
        : 'Choose only from the given options.';
    }

    case 'scale': {
      const min = question.min ?? 0;
      const max = question.max ?? 10;
      if (value.trim() === '') return `Choose a number between ${min} and ${max}.`;
      const number = Number(value);
      if (!Number.isInteger(number) || number < min || number > max) {
        return `Enter a whole number between ${min} and ${max}.`;
      }
      return null;
    }

    case 'number': {
      if (value.trim() === '') return null;
      const number = Number(value);
      if (!Number.isFinite(number)) return 'Enter a number, or leave it blank.';
      if (question.min !== null && number < question.min) return `That looks too low. Expected at least ${question.min}.`;
      if (question.max !== null && number > question.max) return `That looks too high. Expected at most ${question.max}.`;
      return null;
    }

    case 'duration': {
      const trimmed = value.trim();
      if (!trimmed) return 'Roughly how long has this been going on?';
      return trimmed.length > 120 ? 'Keep this short.' : null;
    }

    case 'text': {
      const trimmed = value.trim();
      if (!trimmed) return 'Please add a little detail, or type "none".';
      return trimmed.length > 2000 ? 'That is too long.' : null;
    }

    default:
      return value.trim() ? null : 'An answer is required.';
  }
}
