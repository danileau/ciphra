/**
 * CIPH-917 — /conditions merged into the landing page's #conditions
 * section. The standalone catalogue duplicated the same content with a
 * different layout. The merged section on / now carries the grouped
 * view directly; per-condition deep pages still live at
 * /conditions/{id}.
 *
 * Permanent redirect (308) keeps any external backlinks working — they
 * land on the same content, just in its new home.
 */
import { redirect } from '@sveltejs/kit';

export const load = () => {
	throw redirect(308, '/#conditions');
};
