export interface TLV {
  tag: string;
  name: string;
  length: number;
  value: string;
  children?: TLV[];
}

export interface ConvertOptions {
  amount: number;
  fee?: { type: "fixed" | "percentage"; value: number };
}

const TAG_NAMES: Record<string, string> = {
  "00": "Payload Format Indicator",
  "01": "Point of Initiation Method",
  "02": "Visa",
  "03": "Mastercard",
  "04": "Mastercard",
  "15": "Visa",
  "26": "Merchant Account Information",
  "27": "Merchant Account Information",
  "28": "Merchant Account Information",
  "29": "Merchant Account Information",
  "30": "Merchant Account Information",
  "31": "Merchant Account Information",
  "32": "Merchant Account Information",
  "33": "Merchant Account Information",
  "34": "Merchant Account Information",
  "35": "Merchant Account Information",
  "36": "Merchant Account Information",
  "37": "Merchant Account Information",
  "38": "Merchant Account Information",
  "39": "Merchant Account Information",
  "40": "Merchant Account Information",
  "41": "Merchant Account Information",
  "42": "Merchant Account Information",
  "43": "Merchant Account Information",
  "44": "Merchant Account Information",
  "45": "Merchant Account Information",
  "46": "Merchant Account Information",
  "47": "Merchant Account Information",
  "48": "Merchant Account Information",
  "49": "Merchant Account Information",
  "50": "Merchant Account Information",
  "51": "Merchant Account Information",
  "52": "Merchant Category Code",
  "53": "Transaction Currency",
  "54": "Transaction Amount",
  "55": "Tip or Convenience Indicator",
  "56": "Value of Convenience Fee (Fixed)",
  "57": "Value of Convenience Fee (%)",
  "58": "Country Code",
  "59": "Merchant Name",
  "60": "Merchant City",
  "61": "Postal Code",
  "62": "Additional Data Field",
  "63": "CRC",
};

const NESTED_TAGS = new Set([...Array.from({ length: 26 }, (_, i) => String(i + 26).padStart(2, "0")), "62"]);

export function parseTLV(data: string): TLV[] {
  const elements: TLV[] = [];
  let pos = 0;
  while (pos < data.length) {
    if (pos + 4 > data.length) break;
    const tag = data.substring(pos, pos + 2);
    const length = parseInt(data.substring(pos + 2, pos + 4), 10);
    if (isNaN(length) || pos + 4 + length > data.length) break;
    const value = data.substring(pos + 4, pos + 4 + length);
    const name = TAG_NAMES[tag] ?? `Unknown (${tag})`;
    const element: TLV = { tag, name, length, value };
    if (NESTED_TAGS.has(tag)) element.children = parseTLV(value);
    elements.push(element);
    pos += 4 + length;
  }
  return elements;
}

export function calculateCRC16(str: string): string {
  let crc = 0xffff;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if (crc & 0x8000) crc = ((crc << 1) ^ 0x1021) & 0xffff;
      else crc = (crc << 1) & 0xffff;
    }
  }
  return (crc & 0xffff).toString(16).toUpperCase().padStart(4, "0");
}

function buildTLVString(elements: TLV[]): string {
  return elements
    .map((el) => {
      const value = el.children ? buildTLVString(el.children) : el.value;
      const length = value.length.toString().padStart(2, "0");
      return `${el.tag}${length}${value}`;
    })
    .join("");
}

function makeTLV(tag: string, value: string, name = ""): TLV {
  return { tag, name, length: value.length, value };
}

export function convertQRIS(qrisString: string, options: ConvertOptions): string {
  const elements = parseTLV(qrisString);
  const result: TLV[] = [];
  let amountInserted = false;
  const managedTags = new Set(["54", "55", "56", "57", "63"]);

  for (const el of elements) {
    if (managedTags.has(el.tag)) continue;
    if (el.tag === "01") {
      result.push(makeTLV("01", "12", "Point of Initiation Method"));
      continue;
    }
    if (el.tag === "58" && !amountInserted) {
      const amountStr = options.amount.toString();
      result.push(makeTLV("54", amountStr, "Transaction Amount"));
      if (options.fee) {
        if (options.fee.type === "fixed") {
          result.push(makeTLV("55", "02", "Tip or Convenience Indicator"));
          result.push(makeTLV("56", options.fee.value.toString(), "Value of Convenience Fee (Fixed)"));
        } else {
          result.push(makeTLV("55", "03", "Tip or Convenience Indicator"));
          result.push(makeTLV("57", options.fee.value.toString(), "Value of Convenience Fee (%)"));
        }
      }
      amountInserted = true;
    }
    result.push(el);
  }

  const withoutCRC = buildTLVString(result);
  const crcInput = withoutCRC + "6304";
  const crc = calculateCRC16(crcInput);
  return crcInput + crc;
}
