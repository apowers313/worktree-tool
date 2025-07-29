#!/usr/bin/env node
import { program } from './cli/program';
import { initCommand } from './commands/init';

// Register commands
program.addCommand(initCommand);

// Parse command line arguments
program.parse(process.argv);