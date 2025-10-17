import fs from 'fs';

export const retrieveEnvVariable = (variableName: string) => {
  const variable = process.env[variableName] || '';
  if (!variable) {
    console.log(`${variableName} is not set`);
    process.exit(1);
  }
  return variable;
};

export interface Data {
  privateKey: string;
  pubkey: string;
  solBalance: number | null;
  tokenBuyTx: string | null;
  tokenSellTx: string | null;
}

export const saveDataToFile = (newData: Data[], filePath: string = 'data.json') => {
  try {
    let existingData: Data[] = [];
    if (fs.existsSync(filePath)) {
      const fileContent = fs.readFileSync(filePath, 'utf-8');
      existingData = JSON.parse(fileContent);
    }
    existingData.push(...newData);
    fs.writeFileSync(filePath, JSON.stringify(existingData, null, 2));
  } catch (error) {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log(`File ${filePath} deleted and create new file.`);
      }
      fs.writeFileSync(filePath, JSON.stringify(newData, null, 2));
      console.log('File is saved successfully.');
    } catch (error) {
      console.log('Error saving data to JSON file:', error);
    }
  }
};

export const sleep = async (ms: number) => {
  await new Promise(resolve => setTimeout(resolve, ms));
};

export class RateLimiter {
  private requests: number[] = [];
  constructor(private maxRequests: number = 50, private windowMs: number = 60000) {}
  async waitForSlot(): Promise<void> {
    const now = Date.now();
    this.requests = this.requests.filter(timestamp => now - timestamp < this.windowMs);
    if (this.requests.length >= this.maxRequests) {
      const oldestRequest = Math.min(...this.requests);
      const waitTime = this.windowMs - (now - oldestRequest);
      if (waitTime > 0) {
        console.log(`Rate limit reached, waiting ${waitTime}ms...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        return this.waitForSlot();
      }
    }
    this.requests.push(now);
  }
}

export const globalRateLimiter = new RateLimiter(50, 60000);


