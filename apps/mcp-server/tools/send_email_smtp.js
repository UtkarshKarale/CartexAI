const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

module.exports = {
  name: 'send_email_smtp',
  definition: {
    name: 'send_email_smtp',
    description: 'Send an email using SMTP with optional file attachments. Falls back to credentials configured in jifile.ai Settings → Email / SMTP when none are provided.',
    inputSchema: {
      type: 'object',
      properties: {
        host:       { type: 'string', description: 'SMTP host (defaults to configured account).' },
        port:       { type: 'number', description: 'SMTP port (defaults to configured account).' },
        user:       { type: 'string', description: 'SMTP username (defaults to configured account).' },
        pass:       { type: 'string', description: 'SMTP password (defaults to configured account).' },
        from:       { type: 'string', description: 'Sender email address (defaults to configured account).' },
        from_name:  { type: 'string', description: 'Sender display name (defaults to configured account name).' },
        to:         { type: 'string', description: 'Recipient email address.' },
        subject:    { type: 'string', description: 'Email subject.' },
        text:       { type: 'string', description: 'Plain text body.' },
        html:       { type: 'string', description: 'HTML body (optional).' },
        attachments: {
          type: 'array',
          description: 'List of absolute file paths to attach to the email.',
          items: { type: 'string' },
        },
      },
      required: ['to', 'subject', 'text'],
    },
  },
  handler: async (args) => {
    const host      = args.host      || process.env.SMTP_HOST || '';
    const port      = args.port      || parseInt(process.env.SMTP_PORT || '587');
    const user      = args.user      || process.env.SMTP_USER || '';
    const pass      = args.pass      || process.env.SMTP_PASS || '';
    const fromEmail = args.from      || process.env.SMTP_FROM || user;
    const fromName  = args.from_name || process.env.SMTP_FROM_NAME || '';
    const from      = fromName ? `"${fromName}" <${fromEmail}>` : fromEmail;

    if (!host || !user || !pass) {
      return {
        content: [{ type: 'text', text: 'SMTP not configured. Please add SMTP credentials in jifile.ai Settings → Email / SMTP.' }],
        isError: true,
      };
    }

    const attachmentPaths = Array.isArray(args.attachments) ? args.attachments : [];
    const missing = attachmentPaths.filter(p => !fs.existsSync(p));
    if (missing.length > 0) {
      return {
        content: [{ type: 'text', text: `Attachment(s) not found:\n${missing.join('\n')}` }],
        isError: true,
      };
    }

    const attachments = attachmentPaths.map(filePath => ({
      filename: path.basename(filePath),
      path: filePath,
    }));

    try {
      const transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass },
      });

      const info = await transporter.sendMail({
        from,
        to: args.to,
        subject: args.subject,
        text: args.text,
        html: args.html,
        attachments,
      });

      const attachmentSummary = attachments.length > 0
        ? `\nAttached: ${attachments.map(a => a.filename).join(', ')}`
        : '';

      return {
        content: [{ type: 'text', text: `Email sent successfully. Message ID: ${info.messageId}${attachmentSummary}` }],
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Email error: ${error.message}` }],
        isError: true,
      };
    }
  },
};
