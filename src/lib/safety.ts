const MAX_INPUT_LENGTH = 200;
const MAX_LLM_CONTEXT_LENGTH = 5000;

const CONTROL_CHARS = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;

const INSTRUCTION_PATTERNS = new RegExp(
  '(ignore\\s+(previous|above|all)\\s+instructions|' +
  'you\\s+are\\s+now|system\\s*:\\s*|act\\s+as\\s+|pretend\\s+to\\s+be)',
  'gi',
);

export function sanitizeInput(text: string): string {
  let cleaned = text.replace(CONTROL_CHARS, '');
  cleaned = cleaned.trim();
  if (cleaned.length > MAX_INPUT_LENGTH) {
    cleaned = cleaned.slice(0, MAX_INPUT_LENGTH);
  }
  return cleaned;
}

export function cleanForLLMContext(text: string): string {
  let cleaned = text.replace(CONTROL_CHARS, '');
  cleaned = cleaned.replace(INSTRUCTION_PATTERNS, '[REDACTED]');
  if (cleaned.length > MAX_LLM_CONTEXT_LENGTH) {
    cleaned = cleaned.slice(0, MAX_LLM_CONTEXT_LENGTH) + '\n[TRUNCATED]';
  }
  return cleaned;
}

export function wrapUntrustedData(tag: string, data: string): string {
  const cleaned = cleanForLLMContext(data);
  return `<${tag}>\n${cleaned}\n</${tag}>`;
}
