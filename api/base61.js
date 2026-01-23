// base61.js - Base61 encoding/decoding utility
class Base61 {
  // Characters: 1-9 (9), A-Z (26), a-z (26) = 61 characters
  // Don't use 0 as a character, only 1-9
  static characters = '123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  
  // Encode a number to base61
  static encode(num) {
    if (num === 0) return this.characters[0];
    
    let result = '';
    const base = this.characters.length;
    
    while (num > 0) {
      const remainder = num % base;
      result = this.characters[remainder] + result;
      num = Math.floor(num / base);
    }
    
    return result;
  }
  
  // Decode base61 string to number
  static decode(str) {
    const base = this.characters.length;
    let result = 0;
    
    for (let i = 0; i < str.length; i++) {
      const char = str[i];
      const value = this.characters.indexOf(char);
      if (value === -1) {
        throw new Error(`Invalid base61 character: ${char}`);
      }
      result = result * base + value;
    }
    
    return result;
  }
  
  // Generate random base61 string of given length
  static random(length) {
    let result = '';
    const charsLength = this.characters.length;
    
    for (let i = 0; i < length; i++) {
      const randomIndex = Math.floor(Math.random() * charsLength);
      result += this.characters[randomIndex];
    }
    
    return result;
  }
  
  // Generate timestamp string in YYMMDDHHMMSSS format
  static getTimestampString(date = new Date()) {
    const year = date.getFullYear().toString().slice(-2);
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    const tenths = String(Math.floor(date.getMilliseconds() / 100)).padStart(1, '0');
    
    return year + month + day + hours + minutes + seconds + tenths;
  }
  
  // Convert timestamp string to base61
  static timestampToBase61(timestampStr) {
    const num = parseInt(timestampStr, 10);
    return this.encode(num);
  }
  
  // Generate base61 timestamp (YYMMDDHHMMSSS in base61)
  static generateBase61Timestamp(date = new Date()) {
    const timestampStr = this.getTimestampString(date);
    return this.timestampToBase61(timestampStr);
  }
}

export default Base61;
