// Mock for chalk to avoid ESM issues in Jest
const chalk = {};

const createColorFunction = (prefix, suffix = "\x1b[39m") => {
    const fn = (str) => prefix + str + suffix;

    // Make it chainable
    Object.setPrototypeOf(fn, chalk);

    return fn;
};

chalk.red = createColorFunction("\x1b[31m");
chalk.green = createColorFunction("\x1b[32m");
chalk.yellow = createColorFunction("\x1b[33m");
chalk.blue = createColorFunction("\x1b[34m");
chalk.gray = createColorFunction("\x1b[90m");
chalk.grey = createColorFunction("\x1b[90m");
chalk.cyan = createColorFunction("\x1b[36m");
chalk.bold = createColorFunction("\x1b[1m", "\x1b[22m");
chalk.level = 1;

module.exports = chalk;
module.exports.default = chalk;
