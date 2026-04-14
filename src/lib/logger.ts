import chalk from 'chalk';
import ora, { type Ora } from 'ora';
import Table from 'cli-table3';

export const log = {
  info: (msg: string) => console.log(chalk.cyan('i'), msg),
  success: (msg: string) => console.log(chalk.green('✓'), msg),
  warn: (msg: string) => console.log(chalk.yellow('!'), msg),
  error: (msg: string) => console.error(chalk.red('✗'), msg),
  dim: (msg: string) => console.log(chalk.dim(msg)),
  bold: (msg: string) => console.log(chalk.bold(msg)),
};

export function spinner(text: string): Ora {
  return ora({ text, color: 'cyan' });
}

export function table(headers: string[], rows: string[][]): void {
  const t = new Table({
    head: headers.map((h) => chalk.cyan(h)),
    style: { head: [], border: [] },
  });
  for (const row of rows) {
    t.push(row);
  }
  console.log(t.toString());
}
