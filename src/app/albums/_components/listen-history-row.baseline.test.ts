import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const source = readFileSync(
	join(dirname(fileURLToPath(import.meta.url)), "listen-history-row.tsx"),
	"utf8",
);

test("listen row trigger is flex-col so empty day gutters cannot baseline-inflate li height", () => {
	assert.match(
		source,
		/flex w-full max-w-xl flex-col text-left/,
	);
});

test("day label is out-of-flow so showDay cannot change row height", () => {
	assert.match(
		source,
		/absolute top-2 right-2\.5 font-medium text-\[10px\].*!showDay && "invisible"/s,
	);
});

test("desktop rail is absolutely inset so my-2 gaps do not add flex height", () => {
	assert.match(
		source,
		/absolute top-2 bottom-2 left-0 w-px bg-border\/50/,
	);
});

test("desktop text column stretches to cover with genres mt-auto when present", () => {
	assert.match(source, /items-stretch gap-2\.5 py-2 pr-1 pl-3/);
	assert.match(
		source,
		/flex min-h-0 min-w-0 flex-1 flex-col self-stretch/,
	);
	assert.match(
		source,
		/primaryGenresLine \? \(\s*<span className="mt-auto block truncate text-\[11px\] text-muted-foreground\/70/s,
	);
	assert.match(source, /formatPrimaryGenresLine\(listen\.primaryGenres\)/);
});

test("quiet listen-count chip keeps high-contrast white fill", () => {
	assert.match(source, /bg-white text-zinc-800 ring-1 ring-black\/20/);
});

test("unrated Rate control stops row propagation and opens ranking via onRate", () => {
	assert.match(
		source,
		/function UnrankedQuiet\(\{\s*onRate,?\s*\}:\s*\{\s*onRate\?: \(\) => void;?\s*\}\)/s,
	);
	assert.match(
		source,
		/onClick=\{\(e\) => \{\s*e\.stopPropagation\(\);\s*e\.preventDefault\(\);/s,
	);
	assert.match(source, /<UnrankedQuiet onRate=\{onRate\} \/>/);
});
