function loadImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Không đọc được ảnh'))
    }
    img.src = url
  })
}

function draw(img: HTMLImageElement, maxSide: number, square: boolean): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')!
  if (square) {
    const side = Math.min(img.width, img.height)
    const out = Math.min(maxSide, side)
    canvas.width = canvas.height = out
    ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, out, out)
  } else {
    const scale = Math.min(1, maxSide / Math.max(img.width, img.height))
    canvas.width = Math.round(img.width * scale)
    canvas.height = Math.round(img.height * scale)
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  }
  return canvas
}

/** Small JPEG data URL, stored inside the member / tree document. */
export async function imageToDataUrl(file: Blob, maxSide: number, square = false, quality = 0.8): Promise<string> {
  const img = await loadImage(file)
  return draw(img, maxSide, square).toDataURL('image/jpeg', quality)
}

/** Shrinks a photo before upload (max 1920px, JPEG 80%). Returns the original when it is already smaller. */
export async function compressImage(file: File, maxSide = 1920, quality = 0.8): Promise<File> {
  if (!file.type.startsWith('image/') || file.type === 'image/gif' || file.type === 'image/svg+xml') return file
  try {
    const img = await loadImage(file)
    const canvas = draw(img, maxSide, false)
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', quality))
    if (!blob || blob.size >= file.size) return file
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' })
  } catch {
    return file
  }
}
