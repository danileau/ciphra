/**
 * Recovery code wordlist (300 words).
 * 12 words with checksum ≈ 99 bits entropy.
 * Single source of truth — server does not need this list anymore
 * (codes are generated and validated client-side).
 */
export const WORDLIST: readonly string[] = [
	"able", "acid", "aged", "also", "area", "army", "away", "baby", "back", "ball",
	"band", "bank", "base", "bath", "bear", "beat", "been", "beer", "bell", "belt",
	"best", "bill", "bird", "blow", "blue", "boat", "body", "bomb", "bond", "bone",
	"book", "boot", "born", "boss", "both", "bowl", "bulk", "burn", "bush", "busy",
	"call", "calm", "came", "camp", "card", "care", "case", "cash", "cast", "cell",
	"chat", "chip", "city", "club", "coal", "coat", "code", "cold", "come", "cook",
	"cool", "copy", "core", "cost", "crew", "crop", "dark", "data", "date", "dawn",
	"days", "dead", "deal", "dean", "dear", "debt", "deep", "deny", "desk", "dial",
	"diet", "dirt", "dish", "disk", "does", "done", "door", "dose", "down", "draw",
	"drew", "drop", "drug", "dual", "duke", "dust", "duty", "each", "earn", "ease",
	"east", "easy", "edge", "else", "even", "ever", "evil", "exit", "face", "fact",
	"fail", "fair", "fall", "farm", "fast", "fate", "fear", "feed", "feel", "feet",
	"fell", "felt", "file", "fill", "film", "find", "fine", "fire", "firm", "fish",
	"five", "flat", "flow", "folk", "food", "foot", "form", "fort", "four", "free",
	"from", "fuel", "full", "fund", "gain", "game", "gate", "gave", "gear", "gift",
	"girl", "give", "glad", "goal", "goes", "gold", "golf", "gone", "good", "gray",
	"grew", "grid", "grip", "grow", "gulf", "hair", "half", "hall", "hand", "hang",
	"hard", "harm", "hate", "have", "head", "hear", "heat", "held", "hell", "help",
	"here", "hero", "high", "hill", "hint", "hire", "hold", "hole", "holy", "home",
	"hope", "host", "hour", "huge", "hung", "hunt", "hurt", "idea", "inch", "into",
	"iron", "item", "jack", "jane", "jean", "john", "join", "jump", "june", "jury",
	"just", "keen", "keep", "kent", "kept", "kick", "kill", "kind", "king", "knee",
	"knew", "know", "lack", "lady", "laid", "lake", "land", "lane", "last", "late",
	"lead", "left", "less", "life", "lift", "like", "line", "link", "list", "live",
	"load", "loan", "lock", "logo", "long", "look", "lord", "lose", "loss", "lost",
	"love", "luck", "made", "mail", "main", "make", "male", "many", "mark", "mass",
	"mate", "meal", "mean", "meat", "meet", "menu", "mere", "mike", "mile", "milk",
	"mind", "mine", "miss", "mode", "mood", "moon", "more", "most", "move", "much",
	"must", "name", "navy", "near", "neck", "need", "news", "next", "nice", "nick",
	"nine", "none", "noon", "nose", "note", "nova", "okay", "once", "only", "open"
];

export function generateRecoveryCode(wordCount = 12): string {
	const words: string[] = [];
	const randomValues = new Uint32Array(wordCount - 1);
	crypto.getRandomValues(randomValues);
	for (let i = 0; i < wordCount - 1; i++) {
		words.push(WORDLIST[randomValues[i] % WORDLIST.length]);
	}
	const checksumIndex = words.reduce((sum, w) => sum + WORDLIST.indexOf(w), 0) % WORDLIST.length;
	words.push(WORDLIST[checksumIndex]);
	return words.join(' ');
}

/**
 * Family code: 6 words + 1 checksum word. Meant to be spoken aloud or typed
 * from a phone screen. Lower entropy than a recovery code (~56 bits vs ~99)
 * but adequate given per-grant rate limits and that the attacker also needs
 * the grant_id from the URL or manual share.
 */
export function generateFamilyCode(wordCount = 6): string {
	const words: string[] = [];
	const randomValues = new Uint32Array(wordCount);
	crypto.getRandomValues(randomValues);
	for (let i = 0; i < wordCount; i++) {
		words.push(WORDLIST[randomValues[i] % WORDLIST.length]);
	}
	const checksumIndex = words.reduce((sum, w) => sum + WORDLIST.indexOf(w), 0) % WORDLIST.length;
	words.push(WORDLIST[checksumIndex]);
	return words.join(' ');
}

export function validateFamilyCode(code: string): boolean {
	const words = code.toLowerCase().trim().split(/\s+/);
	if (words.length < 5 || words.length > 13) return false;
	if (!words.every(w => WORDLIST.includes(w))) return false;
	const checksumIndex = words.slice(0, -1).reduce((sum, w) => sum + WORDLIST.indexOf(w), 0) % WORDLIST.length;
	return words[words.length - 1] === WORDLIST[checksumIndex];
}

export function validateRecoveryCode(code: string): boolean {
	const words = code.toLowerCase().trim().split(/\s+/);
	if (words.length !== 12) return false;
	if (!words.every(w => WORDLIST.includes(w))) return false;
	const checksumIndex = words.slice(0, -1).reduce((sum, w) => sum + WORDLIST.indexOf(w), 0) % WORDLIST.length;
	return words[11] === WORDLIST[checksumIndex];
}
