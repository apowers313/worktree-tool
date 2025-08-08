#!/usr/bin/env node
import {program} from "./cli/program.js";
import {createCommand} from "./commands/create.js";
import {execCommand} from "./commands/exec.js";
import {createHelpCommand} from "./commands/help.js";
import {initCommand} from "./commands/init.js";
import {statusCommand} from "./commands/status.js";

// Register commands
program.addCommand(initCommand);
program.addCommand(createCommand);
program.addCommand(execCommand);
program.addCommand(statusCommand);
program.addCommand(createHelpCommand(program));

// Parse command line arguments
program.parse(process.argv);
