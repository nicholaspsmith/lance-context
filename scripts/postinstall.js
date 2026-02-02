#!/usr/bin/env node

/**
 * Postinstall script to register glancey with Claude Code MCP configuration.
 * This runs after npm install and adds glancey as a global MCP server.
 */

import { execSync } from 'child_process';

function main() {
  // Check if claude CLI is available
  try {
    execSync('claude --version', { stdio: 'ignore' });
  } catch {
    console.log('[glancey] Claude Code CLI not found, skipping MCP registration.');
    console.log('[glancey] To manually register, run:');
    console.log('  claude mcp add --scope user --transport stdio glancey -- npx -y glancey');
    return;
  }

  // Check if glancey is already registered
  try {
    const result = execSync('claude mcp get glancey 2>/dev/null', { encoding: 'utf-8' });
    if (result.includes('glancey')) {
      console.log('[glancey] Already registered with Claude Code.');
      return;
    }
  } catch {
    // Not registered, continue with registration
  }

  // Register glancey with Claude Code
  try {
    console.log('[glancey] Registering with Claude Code...');
    execSync(
      'claude mcp add --scope user --transport stdio glancey -- npx -y glancey',
      { stdio: 'inherit' }
    );
    console.log('[glancey] Successfully registered with Claude Code!');
    console.log('[glancey] Restart Claude Code to use semantic code search.');
  } catch (error) {
    console.log('[glancey] Failed to register with Claude Code:', error.message);
    console.log('[glancey] To manually register, run:');
    console.log('  claude mcp add --scope user --transport stdio glancey -- npx -y glancey');
  }
}

main();
