const swatches: ReadonlyArray<readonly [string, number, number, number]> = [
  ['White',235,235,235],['Black',30,30,30],['Grey',130,130,130],
  ['Navy',34,47,74],['Blue',48,99,184],['Green',77,111,71],
  ['Beige',207,188,151],['Brown',114,76,45],['Red',188,47,49],
  ['Pink',221,140,161],['Purple',124,75,155],['Yellow',222,198,65],['Orange',222,129,51],
];

export function suggestPhotoColor(pixels: Uint8ClampedArray, width: number, height: number): string {
  const bins = new Map<string, number>();
  for (let y = Math.round(height * .2); y < height * .8; y += 6) {
    for (let x = Math.round(width * .2); x < width * .8; x += 6) {
      const i = (y * width + x) * 4;
      if (pixels[i + 3] < 128) continue;
      let closest = 'Grey', shortest = Infinity;
      // A linear minimum avoids sorting/allocation and square roots per pixel.
      for (const [name, red, green, blue] of swatches) {
        const distance = (red-pixels[i])**2 + (green-pixels[i+1])**2 + (blue-pixels[i+2])**2;
        if (distance < shortest) {shortest = distance; closest = name;}
      }
      bins.set(closest, (bins.get(closest) || 0) + 1);
    }
  }
  let result = 'Grey', highest = 0;
  for (const [color, count] of bins) if (count > highest) {result = color; highest = count;}
  return result;
}
