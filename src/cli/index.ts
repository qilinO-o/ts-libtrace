import { Command } from "commander";
import { registerInstrumentCommand } from "./instrumentCommand.js";

const buildProgram = (): Command => {
  const program = new Command();

  program.name("libtrace");
  registerInstrumentCommand(program);

  return program;
};

export const runCli = async (): Promise<void> => {
  const program = buildProgram();
  await program.parseAsync(process.argv);
};
