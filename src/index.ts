#!/usr/bin/env node
import { program } from './cli/program';
import { initCommand } from './commands/init';
import { createCommand } from './commands/create';
import { createHelpCommand } from './commands/help';

// Register commands
program.addCommand(initCommand);
program.addCommand(createCommand);
program.addCommand(createHelpCommand(program));

// Parse command line arguments
program.parse(process.argv);