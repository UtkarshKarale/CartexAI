const fs = require('fs/promises');
const path = require('path');
const searchTool = require('./tools/search_file_by_location.js');
const moveTool = require('./tools/move_file.js');

async function run() {
  const vpnDir = '/home/utkarsh/Downloads/VPN';
  const downloadDir = '/home/utkarsh/Downloads';

  console.log('--- Organizing VPN Folder using XFile Tools ---');
  
  // 1. Get files using search tool
  const searchResult = await searchTool.handler({ location: vpnDir });
  const filesText = searchResult.content[0].text;
  
  if (filesText.includes('No files found')) {
    console.log('No files to process.');
    return;
  }

  const files = filesText.split('\n').slice(1); // Skip header
  
  for (const fileName of files) {
    if (fileName === 'devops.ovpn') {
      console.log(`Skipping protected file: ${fileName}`);
      continue;
    }

    console.log(`Moving ${fileName}...`);
    const moveResult = await moveTool.handler({
      source: path.join(vpnDir, fileName),
      destination: path.join(downloadDir, fileName)
    });
    console.log(`  Result: ${moveResult.content[0].text}`);
  }

  console.log('--- Organization Complete ---');
}

run().catch(console.error);
