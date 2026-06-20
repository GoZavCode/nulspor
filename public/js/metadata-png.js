// metadata-png.js
//
// PNG-specifik metadata-fjernelse. PNG bestaar af en 8-byte signatur
// efterfulgt af en raekke "chunks": 4-byte laengde, 4-byte type
// (f.eks. "IHDR", "tEXt"), data, 4-byte CRC. Metadata ligger typisk i
// tEXt/zTXt/iTXt (tekstuelle felter som Author/Comment), eXIf (raw
// EXIF i PNG), og tIME (sidst aendret). Vi bevarer alle strukturelle
// og billeddata-baerende chunks (IHDR, PLTE, IDAT, osv.) uaendret.

window.NULSPOR_PNG = (() => {
  const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

  const METADATA_CHUNK_TYPES = new Set(["tEXt", "zTXt", "iTXt", "eXIf", "tIME"]);

  function readUInt32BE(bytes, offset) {
    return (bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3];
  }

  function isPng(bytes) {
    return SIGNATURE.every((byte, i) => bytes[i] === byte);
  }

  /**
   * Udtraekker tekstuelle metadata-felter (Author, Comment, osv.) fra
   * en PNGs tEXt/iTXt chunks, til visning i analyse-UI'en.
   */
  function readTextMetadata(bytes) {
    if (!isPng(bytes)) throw new Error("Filen er ikke en gyldig PNG.");

    const fields = {};
    let offset = 8;

    while (offset < bytes.length) {
      const length = readUInt32BE(bytes, offset);
      const type = String.fromCharCode(bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7]);

      if (type === "tEXt" || type === "iTXt") {
        const dataStart = offset + 8;
        const dataEnd = dataStart + length;
        const chunkData = bytes.subarray(dataStart, dataEnd);
        // tEXt/iTXt format: "Keyword\0Text..." (iTXt har nogle ekstra felter, men keyword+null er fælles)
        const nullIdx = chunkData.indexOf(0);
        if (nullIdx > -1) {
          const keyword = new TextDecoder().decode(chunkData.subarray(0, nullIdx));
          // For iTXt springer vi compression-flag+method+language+translated-keyword over (forenklet, finder næste null-byte-grænse for selve teksten)
          let textStart = nullIdx + 1;
          if (type === "iTXt") {
            // iTXt: keyword\0 compflag(1) compmethod(1) lang\0 translated\0 text
            textStart += 2; // compflag + compmethod
            const langEnd = chunkData.indexOf(0, textStart);
            if (langEnd > -1) {
              const translatedEnd = chunkData.indexOf(0, langEnd + 1);
              textStart = translatedEnd > -1 ? translatedEnd + 1 : textStart;
            }
          }
          const text = new TextDecoder().decode(chunkData.subarray(textStart));
          fields[keyword] = text;
        }
      }

      if (type === "tIME" && length === 7) {
        const d = bytes.subarray(offset + 8, offset + 8 + 7);
        const year = (d[0] << 8) | d[1];
        fields["Sidst ændret"] = `${year}-${String(d[2]).padStart(2, "0")}-${String(d[3]).padStart(2, "0")} ${String(d[4]).padStart(2, "0")}:${String(d[5]).padStart(2, "0")}:${String(d[6]).padStart(2, "0")}`;
      }

      offset += 4 + 4 + length + 4; // length + type + data + CRC

      if (type === "IEND") break;
    }

    return fields;
  }

  /**
   * Fjerner alle tekstuelle/EXIF/tidsstempel-chunks fra en PNG,
   * bevarer billeddata-chunks uaendret.
   */
  function stripMetadata(bytes) {
    if (!isPng(bytes)) throw new Error("Filen er ikke en gyldig PNG.");

    const chunks = [new Uint8Array(SIGNATURE)];
    let offset = 8;

    while (offset < bytes.length) {
      const length = readUInt32BE(bytes, offset);
      const type = String.fromCharCode(bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7]);
      const chunkTotalLength = 4 + 4 + length + 4;

      if (!METADATA_CHUNK_TYPES.has(type)) {
        chunks.push(bytes.subarray(offset, offset + chunkTotalLength));
      }

      offset += chunkTotalLength;
    }

    const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
    const result = new Uint8Array(totalLength);
    let pos = 0;
    for (const chunk of chunks) {
      result.set(chunk, pos);
      pos += chunk.length;
    }
    return result;
  }

  return { isPng, readTextMetadata, stripMetadata };
})();
