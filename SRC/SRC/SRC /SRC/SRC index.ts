import "dotenv/config";
import { MermailClient } from "@mermail/mcp-sdk";

const inbox = new MermailClient.inbox({ apiKey: process.env.MERMAIL_KEY });
const wallet = new MermailClient.wallet({ apiKey: process.env.MERMAIL_KEY });

export async function scan_invoices() {
  const emails = await inbox.list({ unread: true, limit: 20, query: "invoice" });
  const invoices = [];
  for (const e of emails) {
    const m = e.body.match(/\$(\d+(?:\.\d+)?)/);
    if (!m) continue;
    invoices.push({ id: e.id, from: e.from, amount: parseFloat(m[1]), subject: e.subject });
  }
  return invoices;
}

export async function pay_invoice(emailId: string, amount: number, toEmail: string) {
  const tx = await wallet.send({ to: toEmail, amount, memo: `invoice ${emailId}` });
  await inbox.reply({ emailId, body: `Paid $${amount} - tx: ${tx.hash}` });
  return tx;
                                }
