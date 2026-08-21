/**
 * Note markers reach the doctor's copy only if the user ticks them.
 *
 * Freeform note markers are the only export content authored as prose, and a
 * real export carried a third party's name, a night-time detail and a second
 * physician's opinion. Inclusion is opt-in, decided at report generation
 * rather than at the moment of writing, so the choice is made while looking
 * at the sentences that would be printed.
 *
 * The load-bearing property is that withholding is a FILTER on the document
 * set, not a display flag. `generateDoctorPdf` has no concept of a selection;
 * it simply never sees a withheld note. That is what makes the monthly count
 * row agree with the list — a count of 2 beside one printed note would tell
 * the reader a note was withheld, which is its own disclosure.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const PAGE = readFileSync(join(__dirname, '+page.svelte'), 'utf8');

describe('the export asks before printing prose', () => {
	it('runExport opens the review when the window holds note markers', () => {
		expect(PAGE).toContain('noteMarkersInWindow');
		const fn = PAGE.slice(PAGE.indexOf('function runExport'));
		const body = fn.slice(0, fn.indexOf('\n\t}'));
		expect(body).toMatch(/reviewOpen = true/);
	});

	it('and skips it entirely when there are none', () => {
		// Otherwise every export of a note-free period grows a click.
		const fn = PAGE.slice(PAGE.indexOf('function runExport'));
		const body = fn.slice(0, fn.indexOf('\n\t}'));
		expect(body).toMatch(/notes\.length === 0[\s\S]{0,120}exportForDoctor\(option\)/);
	});

	it('the window comes from reportWindow, not from a second derivation', () => {
		// The review must offer exactly the notes the export would print, so
		// both must agree on where the period starts and ends.
		expect(PAGE).toMatch(/reportWindow\(option\.scope, option\.anchorYear, option\.anchorMonth\)/);
	});
});

describe('withholding is a filter, not a flag', () => {
	it('the selection filters the document set before generation', () => {
		expect(PAGE).toContain('withSelectedNoteMarkers');
		const fn = PAGE.slice(PAGE.indexOf('async function exportForDoctor'));
		const body = fn.slice(0, fn.indexOf('\n\t}'));
		expect(body).toMatch(/withSelectedNoteMarkers\(exportableDocs, selectedNoteIds\)/);
		// The filtered set is what gets generated from.
		expect(body).toMatch(/generateDoctorPdf\(bp, docs,/);
	});

	it('no selection means nothing is withheld', () => {
		// The deep-link path and note-free windows pass no selection at all.
		const fn = PAGE.slice(PAGE.indexOf('async function exportForDoctor'));
		const body = fn.slice(0, fn.indexOf('\n\t}'));
		expect(body).toMatch(/selectedNoteIds\s*\?[\s\S]{0,120}:\s*exportableDocs/);
	});

	it('the CSV path is untouched by the selection', () => {
		// exportCsv does not carry note markers at all; wiring a selection
		// into it would imply a choice that has no effect.
		const fn = PAGE.slice(PAGE.indexOf('async function exportCsvFile'));
		const body = fn.slice(0, fn.indexOf('\n\t}'));
		expect(body).not.toContain('withSelectedNoteMarkers');
	});
});

describe('recorded data is never on the table', () => {
	it('only note markers can be withheld', () => {
		// `withSelectedNoteMarkers` passes everything that is not a note
		// marker through untouched — pinned behaviourally in
		// lib/reports/noteMarkers.test.ts. Here: the page must not reach past
		// it and filter the document set itself.
		const fn = PAGE.slice(PAGE.indexOf('async function exportForDoctor'));
		const body = fn.slice(0, fn.indexOf('\n\t}'));
		expect(body).not.toMatch(/exportableDocs\.filter/);
	});
});
