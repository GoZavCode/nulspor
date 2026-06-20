// metadata-jpeg.js
//
// JPEG-specifik metadata-haandtering. Selve laesningen af EXIF-felter
// (kamera, GPS, osv.) delegeres til exifr (public/vendor/exifr.js).
// Denne fil staar for at FJERNE metadata paa byte-niveau, uden at
// genkode billeddata, saa der ikke sker kvalitetsforringelse.
//
// JPEG-struktur: 0xFFD8 (SOI) foerst, derefter en raekke "markers"
// (0xFF + marker-byte). De fleste markers har en 2-byte
// laengde-header efterfulgt af data. EXIF/XMP ligger i APP1 (0xFFE1),
// IPTC/Photoshop-data i APP13 (0xFFED). Vi fjerner disse specifikke
// segmenter og bevarer resten af filen byte-for-byte.

window.NULSPOR_JPEG = (() => {
  const METADATA_MARKERS = new Set([0xe1, 0xed]); // APP1 (EXIF/XMP), APP13 (IPTC)

  /**
   * Fjerner EXIF/IPTC/XMP-metadata fra en JPEG, bevarer billeddata
   * uaendret. Input og output er Uint8Array.
   */
  function stripMetadata(bytes) {
    if (bytes[0] !== 0xff || bytes[1] !== 0xd8) {
      throw new Error("Filen er ikke en gyldig JPEG.");
    }

    const chunks = [bytes.subarray(0, 2)];
    let offset = 2;

    while (offset < bytes.length) {
      if (bytes[offset] !== 0xff) {
        chunks.push(bytes.subarray(offset));
        break;
      }

      const marker = bytes[offset + 1];

      // SOS (Start of Scan) betyder billeddata starter - kopier resten uaendret
      if (marker === 0xda) {
        chunks.push(bytes.subarray(offset));
        break;
      }

      // Markers uden laengde-felt
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) {
        chunks.push(bytes.subarray(offset, offset + 2));
        offset += 2;
        continue;
      }

      const length = (bytes[offset + 2] << 8) | bytes[offset + 3];

      if (!METADATA_MARKERS.has(marker)) {
        chunks.push(bytes.subarray(offset, offset + 2 + length));
      }

      offset += 2 + length;
    }

    // Beregn total laengde og samle til ét Uint8Array
    const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
    const result = new Uint8Array(totalLength);
    let pos = 0;
    for (const chunk of chunks) {
      result.set(chunk, pos);
      pos += chunk.length;
    }
    return result;
  }

  return { stripMetadata };
})();
