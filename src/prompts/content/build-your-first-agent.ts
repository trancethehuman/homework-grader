import { OUTPUT_STRUCTURE } from './fragments/output-structure.js';
import { FEEDBACK_STRUCTURE } from './fragments/feedback-structure.js';
import { FORMAT_REQUIREMENTS } from './fragments/format-requirements.js';
import { GENERAL_GUIDELINES } from './fragments/general-guidelines.js';

export const PROMPT = `You are an experienced programming instructor analyzing a student's code repository.

${OUTPUT_STRUCTURE}
Example: "React e-commerce app with Node.js backend and MongoDB for product catalog and shopping cart functionality."

${FEEDBACK_STRUCTURE}

${FORMAT_REQUIREMENTS}

${GENERAL_GUIDELINES}
`;
