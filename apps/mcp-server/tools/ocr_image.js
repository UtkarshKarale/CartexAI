module.exports = {
  name: 'ocr_image',
  definition: {
    name: 'ocr_image',
    description: 'Extract text from an image using OCR (requires OCR_SPACE_API_KEY).',
    inputSchema: {
      type: 'object',
      properties: {
        imagePath: { type: 'string', description: 'Path to the image file.' },
        apiKey: { type: 'string', description: 'OCR Space API Key (optional if set in env).' },
      },
      required: ['imagePath'],
    },
  },
  handler: async (args) => {
    const ocrSpace = require('ocr-space-api-wrapper');
    const apiKey = args.apiKey || process.env.OCR_SPACE_API_KEY;
    if (!apiKey || apiKey === 'K88574161788957') { // K88574161788957 is the public demo key
       // We'll proceed with demo key if none provided
    }

    try {
      const response = await ocrSpace(args.imagePath, { apiKey: apiKey || 'K88574161788957' });
      const text = response.ParsedResults.map(res => res.ParsedText).join('\n');
      
      return {
        content: [{ type: 'text', text: text || 'No text found in image.' }],
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `OCR error: ${error.message}` }],
        isError: true,
      };
    }
  },
};
