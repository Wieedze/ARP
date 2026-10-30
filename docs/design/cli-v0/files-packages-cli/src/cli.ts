#!/usr/bin/env node
/**
 * The `arp` binary.
 *
 * `node:sqlite` prints an ExperimentalWarning when first loaded. The default printer is removed
 * before anything is imported, so the hook's stdout and stderr stay clean; `main` is imported
 * dynamically for that reason, after this line runs.
 */
process.removeAllListeners('warning');

const { main } = await import('./main.js');
process.exitCode = await main(process.argv.slice(2));

export {};
