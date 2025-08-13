/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable no-console */
/* eslint-disable @typescript-eslint/no-explicit-any */

export class StdOut {
    static log(...args: any[]): void {
        console.log(...args);
    }

    static warn(...args: any[]): void {
        console.warn(...args);
    }

    static error(...args: any[]): void {
        console.error(...args);
    }
}
