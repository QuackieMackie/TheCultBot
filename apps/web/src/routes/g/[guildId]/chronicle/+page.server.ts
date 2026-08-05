import { listAudit } from '@thecult/shared';
import type { PageServerLoad } from './$types';

const AUDIT_LIMIT = 25;

export const load: PageServerLoad = ({ params }) => ({ audit: listAudit(params.guildId, AUDIT_LIMIT) });
