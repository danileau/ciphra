<script lang="ts">
	import { isAuthenticated, authReady } from '$lib/stores/auth';
	import { darkMode } from '$lib/stores/darkmode';
	import Companion from '$lib/components/Companion.svelte';
	import { onMount } from 'svelte';

	onMount(() => darkMode.init());
</script>

<svelte:head>
	{#if !$isAuthenticated}
		<title>ciphra — encrypted by design</title>
		<meta name="description" content="ciphra ist dein privater, Ende-zu-Ende-verschluesselter Gesundheitsbegleiter. Fuer Epilepsie, ADHS, Diabetes, Burnout, Migraene oder jede andere Erkrankung." />
	{/if}
</svelte:head>

{#if $authReady && $isAuthenticated}
	<Companion />
{:else if $authReady}

<a href="#main-content" class="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:bg-indigo-600 focus:text-white focus:px-4 focus:py-2 focus:rounded-lg focus:outline-none">
	Zum Inhalt springen
</a>

<!-- Navigation -->
<nav class="border-b border-stone-200 dark:border-stone-800 bg-white/80 dark:bg-stone-950/80 backdrop-blur-sm sticky top-0 z-40">
	<div class="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
		<a href="/" class="text-xl font-bold tracking-tight text-stone-900 dark:text-white">ciphra</a>
		<div class="flex items-center gap-3">
			<div class="hidden md:flex items-center gap-1">
				<a href="#so-funktioniert-es" class="text-sm font-medium text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 min-h-[44px] flex items-center px-3">So funktioniert es</a>
				<a href="#sicherheit" class="text-sm font-medium text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 min-h-[44px] flex items-center px-3">Sicherheit</a>
				<a href="#funktionen" class="text-sm font-medium text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 min-h-[44px] flex items-center px-3">Funktionen</a>
			</div>
			<div class="w-px h-6 bg-stone-200 dark:bg-stone-700 hidden md:block"></div>
			<a href="/login" class="min-h-[44px] px-5 flex items-center text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg">
				Anmelden
			</a>
			<button type="button" on:click={() => darkMode.toggle()} aria-label="Darstellung umschalten"
				class="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 hover:bg-stone-100 dark:hover:bg-stone-700">
				{#if $darkMode}
					<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="5" stroke-width="2"/><path d="M12 1v2m0 18v2M4.22 4.22l1.42 1.42m12.72 12.72l1.42 1.42M1 12h2m18 0h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" stroke-width="2" stroke-linecap="round"/></svg>
				{:else}
					<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
				{/if}
			</button>
		</div>
	</div>
</nav>

<main id="main-content">

	<!-- ===== HERO ===== -->
	<section class="relative overflow-hidden">
		<!-- Gradient background -->
		<div class="absolute inset-0 bg-gradient-to-br from-indigo-50 via-stone-50 to-teal-50 dark:from-indigo-950/40 dark:via-stone-950 dark:to-teal-950/30"></div>
		<!-- Subtle grid pattern -->
		<div class="absolute inset-0 opacity-[0.03] dark:opacity-[0.05]" style="background-image: url('data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2260%22 height=%2260%22><rect width=%2260%22 height=%2260%22 fill=%22none%22 stroke=%22%23666%22 stroke-width=%220.5%22/></svg>')"></div>

		<div class="relative max-w-6xl mx-auto px-6 py-24 md:py-36 lg:py-44">
			<div class="max-w-3xl">
				<div class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-100 dark:bg-indigo-500/15 mb-6">
					<svg class="w-4 h-4 text-indigo-600 dark:text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke-width="2"/></svg>
					<span class="text-sm font-semibold text-indigo-700 dark:text-indigo-300 tracking-wide">encrypted by design</span>
				</div>
				<h1 class="text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight leading-[1.1] mb-6 text-stone-900 dark:text-white">
					Deine Gesundheit.<br>
					<span class="bg-gradient-to-r from-indigo-600 to-teal-500 bg-clip-text text-transparent">Dein Schluessel.</span>
				</h1>
				<p class="text-xl md:text-2xl text-stone-600 dark:text-stone-400 leading-relaxed mb-4 max-w-2xl font-light">
					ciphra ist der erste Gesundheitsbegleiter, der deine Daten <strong class="font-semibold text-stone-900 dark:text-stone-200">mathematisch nicht lesen kann</strong>. Ende-zu-Ende-verschluesselt. Fuer jede Erkrankung.
				</p>
				<p class="text-base text-stone-500 dark:text-stone-500 leading-relaxed mb-10 max-w-2xl">
					3 Minuten am Abend. Haekchen setzen, Zaehler antippen, speichern. Am Monatsende ein Raster, das dein Arzt in 30 Sekunden lesen kann.
				</p>
				<div class="flex flex-wrap gap-4">
					<a href="/login" class="inline-flex items-center justify-center min-h-[52px] px-8 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl text-base shadow-lg shadow-indigo-500/20">
						Kostenlos starten
					</a>
					<a href="#problem" class="inline-flex items-center justify-center min-h-[52px] px-8 border-2 border-stone-300 dark:border-stone-600 text-stone-700 dark:text-stone-300 hover:bg-white/50 dark:hover:bg-stone-800/50 font-medium rounded-xl text-base gap-2">
						Mehr erfahren
						<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 14l-7 7m0 0l-7-7m7 7V3" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
					</a>
				</div>

				<!-- Trust badges -->
				<div class="flex flex-wrap items-center gap-6 mt-12 text-sm text-stone-500 dark:text-stone-400">
					<div class="flex items-center gap-2">
						<svg class="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" stroke-width="2" stroke-linecap="round"/><polyline points="22,4 12,14.01 9,11.01" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
						<span>AES-256-GCM + Argon2id</span>
					</div>
					<div class="flex items-center gap-2">
						<svg class="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" stroke-width="2" stroke-linecap="round"/><polyline points="22,4 12,14.01 9,11.01" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
						<span>Open Source</span>
					</div>
					<div class="flex items-center gap-2">
						<svg class="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" stroke-width="2" stroke-linecap="round"/><polyline points="22,4 12,14.01 9,11.01" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
						<span>Zero Knowledge</span>
					</div>
				</div>
			</div>
		</div>
	</section>

	<!-- ===== PROBLEM ===== -->
	<section class="py-20 md:py-28 bg-white dark:bg-stone-900 border-y border-stone-200 dark:border-stone-800" id="problem">
		<div class="max-w-6xl mx-auto px-6">
			<div class="max-w-3xl">
				<h2 class="text-3xl md:text-4xl font-bold tracking-tight mb-6 text-stone-900 dark:text-white">Warum bestehende Gesundheits-Apps scheitern</h2>
				<p class="text-stone-600 dark:text-stone-400 text-lg leading-relaxed mb-10">
					Gesundheitsdaten sind die privatesten Daten, die es gibt. Die meisten Apps speichern sie im Klartext auf fremden Servern. Und selbst wenn die Verschluesselung stimmt — sie scheitern an der Alltagstauglichkeit.
				</p>

				<!-- Anonymized caregiver story -->
				<div class="rounded-2xl border border-indigo-200 dark:border-indigo-800/50 p-6 md:p-8 bg-gradient-to-br from-indigo-50 to-stone-50 dark:from-indigo-950/20 dark:to-stone-950 mb-10">
					<div class="flex items-start gap-4 mb-4">
						<div class="w-12 h-12 rounded-xl bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center flex-shrink-0">
							<svg class="w-6 h-6 text-indigo-600 dark:text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="7" r="4" stroke-width="2"/></svg>
						</div>
						<div>
							<p class="font-semibold text-stone-900 dark:text-white text-lg">Aus der Praxis</p>
							<p class="text-sm text-stone-500 dark:text-stone-400">Erfahrung einer Angehoerigen, die taeglich fuer eine betroffene Person dokumentiert</p>
						</div>
					</div>
					<blockquote class="text-stone-700 dark:text-stone-300 italic leading-relaxed mb-5 border-l-3 border-indigo-400 dark:border-indigo-600 pl-5 text-lg">
						"Es war zu umstaendlich. Fuer jeden Eintrag ein eigenes Formular oeffnen, Felder ausfuellen, speichern. Am Ende habe ich mir ein einfaches Excel gebaut."
					</blockquote>
					<p class="text-stone-600 dark:text-stone-400 leading-relaxed">
						20 Symptome taeglich abhaken, Anfaelle zaehlen, Medikamente kontrollieren, Ausloeser dokumentieren — das muss in 3 Minuten gehen, nicht in 15. Ihr Excel hat Zeilen fuer Tage und Spalten fuer Symptome. <strong class="text-stone-900 dark:text-stone-200">ciphra macht genau das</strong> — digital, verschluesselt, mit einem Monatsraster, das der Arzt in Sekunden lesen kann.
					</p>
				</div>

				<!-- Three problems -->
				<div class="grid grid-cols-1 md:grid-cols-3 gap-6">
					<div class="rounded-xl border border-stone-200 dark:border-stone-800 p-6 bg-stone-50 dark:bg-stone-950 hover:border-red-300 dark:hover:border-red-800 group">
						<div class="w-12 h-12 rounded-xl bg-red-100 dark:bg-red-900/20 flex items-center justify-center mb-4 group-hover:scale-105">
							<svg class="w-6 h-6 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 9v4m0 4h.01M3.73 21h16.54a2 2 0 0 0 1.67-3.14L13.67 3.86a2 2 0 0 0-3.34 0L2.06 17.86A2 2 0 0 0 3.73 21z" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
						</div>
						<h3 class="font-bold text-stone-900 dark:text-white mb-2">Datenschutz-Risiko</h3>
						<p class="text-sm text-stone-500 dark:text-stone-400 leading-relaxed">Server speichern Diagnosen im Klartext. Ein Datenleck offenbart alles.</p>
					</div>
					<div class="rounded-xl border border-stone-200 dark:border-stone-800 p-6 bg-stone-50 dark:bg-stone-950 hover:border-amber-300 dark:hover:border-amber-800 group">
						<div class="w-12 h-12 rounded-xl bg-amber-100 dark:bg-amber-900/20 flex items-center justify-center mb-4 group-hover:scale-105">
							<svg class="w-6 h-6 text-amber-600 dark:text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" stroke-width="2"/><line x1="3" y1="9" x2="21" y2="9" stroke-width="2"/><line x1="9" y1="21" x2="9" y2="9" stroke-width="2"/></svg>
						</div>
						<h3 class="font-bold text-stone-900 dark:text-white mb-2">Starre Strukturen</h3>
						<p class="text-sm text-stone-500 dark:text-stone-400 leading-relaxed">Feste Felder, die nicht zu deiner Erkrankung passen. Keine eigenen Symptome.</p>
					</div>
					<div class="rounded-xl border border-stone-200 dark:border-stone-800 p-6 bg-stone-50 dark:bg-stone-950 hover:border-stone-400 dark:hover:border-stone-600 group">
						<div class="w-12 h-12 rounded-xl bg-stone-200 dark:bg-stone-800 flex items-center justify-center mb-4 group-hover:scale-105">
							<svg class="w-6 h-6 text-stone-600 dark:text-stone-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke-width="2"/><polyline points="12,6 12,12 16,14" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
						</div>
						<h3 class="font-bold text-stone-900 dark:text-white mb-2">Zu langsam</h3>
						<p class="text-sm text-stone-500 dark:text-stone-400 leading-relaxed">15 Minuten Formulare ausfuellen statt 3 Minuten Haekchen setzen.</p>
					</div>
				</div>
			</div>
		</div>
	</section>

	<!-- ===== HOW IT WORKS ===== -->
	<section class="py-20 md:py-28 bg-stone-50 dark:bg-stone-950" id="so-funktioniert-es">
		<div class="max-w-6xl mx-auto px-6">
			<div class="text-center mb-14">
				<h2 class="text-3xl md:text-4xl font-bold tracking-tight mb-4 text-stone-900 dark:text-white">Drei Schritte. Jeden Abend.</h2>
				<p class="text-stone-500 dark:text-stone-400 text-lg max-w-xl mx-auto">Von der Registrierung zum Arztbericht in unter einer Woche.</p>
			</div>

			<div class="grid grid-cols-1 md:grid-cols-3 gap-8">
				<div class="relative rounded-2xl border border-stone-200 dark:border-stone-800 p-8 bg-white dark:bg-stone-900">
					<div class="absolute -top-4 left-8 w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-indigo-600 flex items-center justify-center text-white font-bold text-sm shadow-lg shadow-indigo-500/30">1</div>
					<div class="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-100 to-indigo-50 dark:from-indigo-900/30 dark:to-indigo-950/20 flex items-center justify-center mb-5 mt-2">
						<svg class="w-7 h-7 text-indigo-600 dark:text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3" stroke-width="2"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" stroke-width="2"/></svg>
					</div>
					<h3 class="text-xl font-bold text-stone-900 dark:text-white mb-3">Profil einrichten</h3>
					<p class="text-stone-500 dark:text-stone-400 leading-relaxed">Vorlage waehlen oder eigenes Profil erstellen. Symptome, Ausloeser und Vitalwerte definieren — alles anpassbar.</p>
				</div>

				<div class="relative rounded-2xl border border-stone-200 dark:border-stone-800 p-8 bg-white dark:bg-stone-900">
					<div class="absolute -top-4 left-8 w-8 h-8 rounded-full bg-gradient-to-br from-teal-500 to-teal-600 flex items-center justify-center text-white font-bold text-sm shadow-lg shadow-teal-500/30">2</div>
					<div class="w-14 h-14 rounded-2xl bg-gradient-to-br from-teal-100 to-teal-50 dark:from-teal-900/30 dark:to-teal-950/20 flex items-center justify-center mb-5 mt-2">
						<svg class="w-7 h-7 text-teal-600 dark:text-teal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" stroke-width="2" stroke-linecap="round"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1" stroke-width="2"/><path d="M9 12l2 2 4-4" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
					</div>
					<h3 class="text-xl font-bold text-stone-900 dark:text-white mb-3">Tag protokollieren</h3>
					<p class="text-stone-500 dark:text-stone-400 leading-relaxed">Jeden Abend in 3 Minuten: Symptom-Chips antippen, Zaehler setzen, Medikamente abhaken. Keine Formulare.</p>
				</div>

				<div class="relative rounded-2xl border border-stone-200 dark:border-stone-800 p-8 bg-white dark:bg-stone-900">
					<div class="absolute -top-4 left-8 w-8 h-8 rounded-full bg-gradient-to-br from-rose-500 to-rose-600 flex items-center justify-center text-white font-bold text-sm shadow-lg shadow-rose-500/30">3</div>
					<div class="w-14 h-14 rounded-2xl bg-gradient-to-br from-rose-100 to-rose-50 dark:from-rose-900/30 dark:to-rose-950/20 flex items-center justify-center mb-5 mt-2">
						<svg class="w-7 h-7 text-rose-600 dark:text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke-width="2"/><polyline points="14,2 14,8 20,8" stroke-width="2"/><line x1="16" y1="13" x2="8" y2="13" stroke-width="2" stroke-linecap="round"/><line x1="16" y1="17" x2="8" y2="17" stroke-width="2" stroke-linecap="round"/></svg>
					</div>
					<h3 class="text-xl font-bold text-stone-900 dark:text-white mb-3">Arzt das Raster zeigen</h3>
					<p class="text-stone-500 dark:text-stone-400 leading-relaxed">Monatsraster mit Summen und Prozenten. Als PDF exportieren. Der Arzt sieht den ganzen Monat in 30 Sekunden.</p>
				</div>
			</div>
		</div>
	</section>

	<!-- ===== CONDITION TEMPLATES ===== -->
	<section class="py-20 md:py-28 bg-white dark:bg-stone-900 border-y border-stone-200 dark:border-stone-800" id="vorlagen">
		<div class="max-w-6xl mx-auto px-6">
			<div class="text-center mb-14">
				<h2 class="text-3xl md:text-4xl font-bold tracking-tight mb-4 text-stone-900 dark:text-white">Eine App. <span class="bg-gradient-to-r from-indigo-600 to-teal-500 bg-clip-text text-transparent">Jede Erkrankung.</span></h2>
				<p class="text-stone-500 dark:text-stone-400 text-lg max-w-xl mx-auto">Waehle eine Vorlage als Startpunkt oder erstelle dein eigenes Profil.</p>
			</div>

			<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
				{#each [
					{ name: 'Epilepsie', desc: 'Anfallstypen, Auren, Medikamente, anfallsfreie Tage', color: '#DC2626', bg: 'from-red-50 to-rose-50 dark:from-red-950/20 dark:to-rose-950/10', icon: 'activity' },
					{ name: 'ADHS', desc: 'Fokus, Impulskontrolle, Emotionen, Energie, Medikamenten-Wirkung', color: '#F59E0B', bg: 'from-amber-50 to-yellow-50 dark:from-amber-950/20 dark:to-yellow-950/10', icon: 'brain' },
					{ name: 'Diabetes', desc: 'Blutzucker, Insulin, HbA1c, Kohlenhydrate, Hypo-/Hyperglykamie', color: '#0D9488', bg: 'from-teal-50 to-emerald-50 dark:from-teal-950/20 dark:to-emerald-950/10', icon: 'droplet' },
					{ name: 'Burnout', desc: 'Energie-Level, Stimmung, Schlaf, Belastung, Erholung', color: '#8B5CF6', bg: 'from-violet-50 to-purple-50 dark:from-violet-950/20 dark:to-purple-950/10', icon: 'battery' },
					{ name: 'Migraene', desc: 'Attacken, Aura, Schmerzlevel, Licht-/Laermempfindlichkeit, Trigger', color: '#EC4899', bg: 'from-pink-50 to-rose-50 dark:from-pink-950/20 dark:to-rose-950/10', icon: 'cloud' }
				] as tmpl}
					<div class="rounded-2xl border border-stone-200 dark:border-stone-800 p-6 bg-gradient-to-br {tmpl.bg} hover:shadow-lg hover:shadow-stone-200/50 dark:hover:shadow-stone-900/50">
						<div class="w-12 h-12 rounded-xl flex items-center justify-center mb-4" style="background: {tmpl.color}15">
							<div class="w-5 h-5 rounded-full" style="background: {tmpl.color}"></div>
						</div>
						<h3 class="font-bold text-lg text-stone-900 dark:text-white mb-2">{tmpl.name}</h3>
						<p class="text-sm text-stone-500 dark:text-stone-400 leading-relaxed">{tmpl.desc}</p>
					</div>
				{/each}
				<!-- Custom -->
				<div class="rounded-2xl border-2 border-dashed border-stone-300 dark:border-stone-700 p-6 flex flex-col items-center justify-center text-center hover:border-indigo-400 dark:hover:border-indigo-600">
					<div class="w-12 h-12 rounded-xl bg-stone-100 dark:bg-stone-800 flex items-center justify-center mb-4">
						<svg class="w-6 h-6 text-stone-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 5v14m-7-7h14" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
					</div>
					<h3 class="font-bold text-lg text-stone-900 dark:text-white mb-2">Eigenes Profil</h3>
					<p class="text-sm text-stone-500 dark:text-stone-400">Komplett individuell konfigurieren</p>
				</div>
			</div>
		</div>
	</section>

	<!-- ===== SECURITY ===== -->
	<section class="py-20 md:py-28 bg-stone-50 dark:bg-stone-950" id="sicherheit">
		<div class="max-w-6xl mx-auto px-6">
			<div class="flex items-start gap-5 mb-10">
				<div class="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-100 to-indigo-50 dark:from-indigo-900/30 dark:to-indigo-950/20 flex items-center justify-center flex-shrink-0">
					<svg class="w-8 h-8 text-indigo-600 dark:text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke-width="2"/></svg>
				</div>
				<div>
					<h2 class="text-3xl md:text-4xl font-bold tracking-tight text-stone-900 dark:text-white">Zero-Knowledge Architektur</h2>
					<p class="text-stone-500 dark:text-stone-400 text-lg mt-2 max-w-2xl">Der Server speichert nur verschluesselte Blobs. Kein Datentyp, kein Datum, keine Struktur — nichts, was Rueckschluesse erlaubt.</p>
				</div>
			</div>

			<!-- Key hierarchy -->
			<div class="rounded-2xl border border-stone-200 dark:border-stone-800 p-6 md:p-8 bg-white dark:bg-stone-900 mb-8">
				<h3 class="font-bold text-stone-900 dark:text-white mb-6 text-lg">Schluessel-Hierarchie</h3>
				<div class="font-mono text-sm text-stone-700 dark:text-stone-300 leading-relaxed overflow-x-auto">
					<pre class="whitespace-pre">Dein Passwort
  |
  +-- Argon2id (":AUTH")  --> auth_hash (Server speichert nur diesen Hash)
  |
  +-- Argon2id (":VAULT") --> vault_key (verschluesselt Master Key lokal)

Master Key (zufaellige 256 Bit, bei Registrierung erzeugt)
  +-- AES-256-GCM --> verschluesselt ALLE Gesundheitsdaten
  |     Verlaesst NIEMALS dein Geraet.
  |
  +-- Recovery Code (12-Woerter-Mnemonic) sichert Master Key als Backup</pre>
				</div>
			</div>

			<!-- What server sees vs can't -->
			<div class="grid grid-cols-1 md:grid-cols-2 gap-6">
				<div class="rounded-2xl border border-emerald-200 dark:border-emerald-800/50 p-6 bg-emerald-50/50 dark:bg-emerald-950/10">
					<div class="flex items-center gap-2 mb-4">
						<svg class="w-5 h-5 text-emerald-600 dark:text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke-width="2"/><circle cx="12" cy="12" r="3" stroke-width="2"/></svg>
						<h3 class="font-bold text-stone-900 dark:text-white">Server sieht</h3>
					</div>
					<ul class="space-y-2.5 text-sm text-stone-600 dark:text-stone-400">
						<li class="flex items-center gap-2"><span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> Benutzername</li>
						<li class="flex items-center gap-2"><span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> Auth-Hash (nicht dein Passwort)</li>
						<li class="flex items-center gap-2"><span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> Verschluesselte Blobs</li>
						<li class="flex items-center gap-2"><span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> Upload-Zeitstempel</li>
					</ul>
				</div>
				<div class="rounded-2xl border border-red-200 dark:border-red-800/50 p-6 bg-red-50/50 dark:bg-red-950/10">
					<div class="flex items-center gap-2 mb-4">
						<svg class="w-5 h-5 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><line x1="1" y1="1" x2="23" y2="23" stroke-width="2" stroke-linecap="round"/></svg>
						<h3 class="font-bold text-stone-900 dark:text-white">Server sieht NICHT</h3>
					</div>
					<ul class="space-y-2.5 text-sm text-stone-600 dark:text-stone-400">
						<li class="flex items-center gap-2"><svg class="w-3.5 h-3.5 text-red-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12" stroke-width="2.5" stroke-linecap="round"/></svg> Welche Erkrankung du hast</li>
						<li class="flex items-center gap-2"><svg class="w-3.5 h-3.5 text-red-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12" stroke-width="2.5" stroke-linecap="round"/></svg> Symptome, Anfaelle, Medikamente</li>
						<li class="flex items-center gap-2"><svg class="w-3.5 h-3.5 text-red-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12" stroke-width="2.5" stroke-linecap="round"/></svg> An welchen Tagen etwas passiert ist</li>
						<li class="flex items-center gap-2"><svg class="w-3.5 h-3.5 text-red-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12" stroke-width="2.5" stroke-linecap="round"/></svg> Notizen, Vitalwerte, Trigger</li>
					</ul>
				</div>
			</div>
		</div>
	</section>

	<!-- ===== FEATURES ===== -->
	<section class="py-20 md:py-28 bg-white dark:bg-stone-900 border-y border-stone-200 dark:border-stone-800" id="funktionen">
		<div class="max-w-6xl mx-auto px-6">
			<div class="text-center mb-14">
				<h2 class="text-3xl md:text-4xl font-bold tracking-tight mb-4 text-stone-900 dark:text-white">Alles, was du brauchst. Nichts, was du nicht brauchst.</h2>
			</div>

			<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
				{#each [
					{ title: 'Tagesprotokoll', desc: 'Toggle-Chips, Zaehler, Checklisten. 3 Minuten, fertig.', color: 'indigo', icon: 'M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2' },
					{ title: 'Monatsraster', desc: 'Tage als Zeilen, Symptome als Spalten. Summen und Prozente.', color: 'teal', icon: 'M3 3h18v18H3zM3 9h18M3 15h18M9 3v18M15 3v18' },
					{ title: 'Kalender', desc: 'Monatsansicht mit farbcodierten Punkten. Muster erkennen.', color: 'blue', icon: 'M3 4h18v18H3zM16 2v4M8 2v4M3 10h18' },
					{ title: 'PDF-Export', desc: 'Monatsberichte im Browser generieren. Kein Server-Kontakt.', color: 'rose', icon: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z' },
					{ title: 'Offline-Modus', desc: 'PWA mit verschluesseltem Cache. Funktioniert ohne Internet.', color: 'emerald', icon: 'M5 12.55a11 11 0 0 1 14.08 0M1.42 9a16 16 0 0 1 21.16 0M8.53 16.11a6 6 0 0 1 6.95 0M12 20h.01' },
					{ title: 'Mehrsprachig', desc: 'Deutsch, Englisch, Italienisch, Franzoesisch.', color: 'violet', icon: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z' },
					{ title: 'Dunkelmodus', desc: 'Erkennt Systemeinstellung oder manuell umschaltbar.', color: 'stone', icon: 'M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z' },
					{ title: 'Eigene Felder', desc: 'Symptome, Trigger, Vitalwerte individuell definierbar.', color: 'amber', icon: 'M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z' }
				] as feat}
					<div class="rounded-2xl border border-stone-200 dark:border-stone-800 p-6 bg-stone-50 dark:bg-stone-950 hover:shadow-md">
						<div class="w-12 h-12 rounded-xl bg-{feat.color}-100 dark:bg-{feat.color}-900/20 flex items-center justify-center mb-4">
							<svg class="w-5 h-5 text-{feat.color}-600 dark:text-{feat.color}-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="{feat.icon}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
						</div>
						<h3 class="font-bold text-base mb-2 text-stone-900 dark:text-white">{feat.title}</h3>
						<p class="text-sm text-stone-500 dark:text-stone-400 leading-relaxed">{feat.desc}</p>
					</div>
				{/each}
			</div>
		</div>
	</section>

	<!-- ===== CTA ===== -->
	<section class="py-20 md:py-28 relative overflow-hidden">
		<div class="absolute inset-0 bg-gradient-to-br from-indigo-600 to-indigo-800 dark:from-indigo-900 dark:to-indigo-950"></div>
		<div class="relative max-w-6xl mx-auto px-6 text-center">
			<h2 class="text-3xl md:text-4xl font-bold tracking-tight mb-4 text-white">Keine Wellness-App.</h2>
			<p class="text-indigo-100 text-lg mb-10 max-w-2xl mx-auto leading-relaxed">
				ciphra ist ein ernsthaftes Werkzeug fuer Menschen, die taeglich mit einer echten Erkrankung leben. Gebaut von jemandem, der das Problem seit 7 Jahren kennt.
			</p>
			<a href="/login" class="inline-flex items-center justify-center min-h-[52px] px-8 bg-white hover:bg-stone-100 text-indigo-700 font-semibold rounded-xl text-base shadow-lg">
				Kostenlos starten
			</a>
		</div>
	</section>

</main>

<!-- Footer -->
<footer class="border-t border-stone-200 dark:border-stone-800 py-12 bg-white dark:bg-stone-900">
	<div class="max-w-6xl mx-auto px-6">
		<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 mb-10">
			<div>
				<span class="text-lg font-bold tracking-tight text-stone-900 dark:text-white">ciphra</span>
				<p class="text-xs font-semibold tracking-widest uppercase text-indigo-600 dark:text-indigo-400 mt-1">encrypted by design</p>
				<p class="text-sm text-stone-500 dark:text-stone-400 mt-3 leading-relaxed">Dein privater Gesundheitsbegleiter.<br>Ende-zu-Ende-verschluesselt.</p>
			</div>
			<div>
				<h3 class="text-sm font-semibold mb-3 text-stone-900 dark:text-white">Produkt</h3>
				<ul class="space-y-2 text-sm text-stone-500 dark:text-stone-400">
					<li><a href="#so-funktioniert-es" class="hover:text-stone-900 dark:hover:text-stone-100">So funktioniert es</a></li>
					<li><a href="#vorlagen" class="hover:text-stone-900 dark:hover:text-stone-100">Vorlagen</a></li>
					<li><a href="#funktionen" class="hover:text-stone-900 dark:hover:text-stone-100">Funktionen</a></li>
					<li><a href="#sicherheit" class="hover:text-stone-900 dark:hover:text-stone-100">Sicherheit</a></li>
				</ul>
			</div>
			<div>
				<h3 class="text-sm font-semibold mb-3 text-stone-900 dark:text-white">Links</h3>
				<ul class="space-y-2 text-sm text-stone-500 dark:text-stone-400">
					<li><a href="/login" class="hover:text-stone-900 dark:hover:text-stone-100">Anmelden</a></li>
					<li><a href="/login" class="hover:text-stone-900 dark:hover:text-stone-100">Registrieren</a></li>
				</ul>
			</div>
			<div>
				<h3 class="text-sm font-semibold mb-3 text-stone-900 dark:text-white">Domains</h3>
				<ul class="space-y-2 text-sm text-stone-500 dark:text-stone-400">
					<li>ciphra.ch</li>
					<li>ciphra.app</li>
				</ul>
			</div>
		</div>
		<div class="border-t border-stone-200 dark:border-stone-800 pt-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-stone-400 dark:text-stone-500">
			<span>&copy; 2026 ciphra</span>
			<span class="text-xs tracking-wider uppercase">encrypted by design</span>
		</div>
	</div>
</footer>

{/if}
