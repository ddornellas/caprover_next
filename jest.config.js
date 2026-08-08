/* eslint-disable no-undef */
module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    transform: {
        "^.+\\.tsx?$": "ts-jest",
        "^.+\\.ts?$": "ts-jest",
    },
    testRegex: "(/tests/.*|(\\.|/)(test|spec))\\.(jsx?|tsx?|ts?|js?)$",
    testPathIgnorePatterns: ["/node_modules/", "/frontend/legacy/"],
    moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json", "node"],
    watchman: false,
    collectCoverage: true,
};
