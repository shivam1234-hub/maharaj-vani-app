#!/usr/bin/env node
'use strict';

/**
 * Development helper: run the unpackaged app through a screenshot plan.
 *
 *   node scripts/shots.js <plan.json>
 *
 * The plan is { outDir, bootMs?, steps: [{ route?, js?, theme?, width?, height?, waitMs?, file? }] }
 * and is executed by main.js (VV_SHOTS), which also writes the renderer
 * console to <outDir>/console.log. Never active in a packaged build.
 */
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const plan = process.argv[2];
if (!plan) {
  console.error('usage: node scripts/shots.js <plan.json>');
  process.exit(1);
}
const env = { ...process.env, VV_SHOTS: path.resolve(plan), VV_INSECURE_TLS: process.env.VV_INSECURE_TLS ?? '1' };
delete env.ELECTRON_RUN_AS_NODE;
const electron = require('electron');
const r = spawnSync(electron, [path.resolve(__dirname, '..')], { env, stdio: 'inherit' });
process.exit(r.status ?? 1);
