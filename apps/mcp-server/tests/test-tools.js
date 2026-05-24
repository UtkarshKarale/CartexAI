const fs = require('fs');
const path = require('path');

/**
 * Validation Script for XFile MCP Tools
 * This script imports each tool and runs its handler with mock arguments
 * to ensure basic functionality and error handling.
 */

const toolsDir = path.join(__dirname, '../tools');
const files = fs.readdirSync(toolsDir);

async function runTests() {
  console.log('🚀 Starting XFile MCP Tool Validation...\n');
  let passed = 0;
  let failed = 0;

  for (const file of files) {
    if (!file.endsWith('.js')) continue;

    const toolName = file.replace('.js', '');
    console.log(`Testing [${toolName}]...`);

    try {
      const tool = require(path.join(toolsDir, file));
      
      // Basic check for structure
      if (!tool.name || !tool.definition || !tool.handler) {
        throw new Error('Tool is missing required structure (name, definition, or handler)');
      }

      // We run a "dry run" or simple case for tools where possible
      // For more complex tools, we just verify they don't crash on import/initialization
      
      let result;
      if (toolName === 'detect_os') {
        result = await tool.handler({});
      } else if (toolName === 'read_file') {
        // Test with a non-existent file to check error handling
        result = await tool.handler({ path: 'non-existent.txt' });
      } else if (toolName === 'system_info') {
        result = await tool.handler({});
      }

      if (result && result.isError) {
         console.log(`  ⚠️  ${toolName} returned handled error (intended for some tests): ${result.content[0].text.substring(0, 50)}...`);
      } else {
         console.log(`  ✅ ${toolName} passed structure/init check.`);
      }
      passed++;
    } catch (err) {
      console.error(`  ❌ ${toolName} FAILED:`, err.message);
      failed++;
    }
  }

  console.log(`\nTest Summary: ${passed} passed, ${failed} failed.`);
}

runTests();
