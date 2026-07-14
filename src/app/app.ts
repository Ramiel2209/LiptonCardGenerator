import { Component, ElementRef, ViewChild, HostListener, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import html2canvas, { Options } from 'html2canvas';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './app.html',
  styleUrls: ['./app.css'],
})
export class App implements AfterViewInit {
  @ViewChild('cardCaptureArea', { static: false }) cardCaptureArea!: ElementRef<HTMLDivElement>;

  mode: 'cover' | 'watermark' = 'cover';
  orientation: 'portrait' | 'landscape' = 'portrait';
  wmOpacity: number = 15;
  zoomValue: number = 100;
  isImageLoaded: boolean = false;

  mainTitle: string = '';
  subTitle: string = '';
  tagText: string = '';

  userImageSrc: string | null = null;
  imgElement: HTMLImageElement | null = null;

  imgLeft: number = 0;
  imgTop: number = 0;
  imgWidth: number = 0;
  imgHeight: number = 0;

  // 預覽/擷取容器的實際像素尺寸，由 calculateContainerSize() 算出，
  // 透過 [style.width.px] / [style.height.px] 直接綁在容器上。
  // 不再依賴 CSS 的 aspect-ratio，因為 html2canvas 不支援這個屬性，
  // 靠它撐高度會讓下載出來的圖比例跑掉（桌機版用寫死的 px 才會正常）。
  containerWidthPx: number = 400;
  containerHeightPx: number = 600;

  private baseWidth: number = 0;
  private baseHeight: number = 0;
  private currentScale: number = 1.0;

  private isDragging: boolean = false;
  private startX: number = 0;
  private startY: number = 0;

  private watermarkSrcCache: { [key: string]: string } = {};
  private watermarkProcessing: { [key: string]: boolean } = {};

  ngAfterViewInit() {
    this.calculateContainerSize();
  }

  get wmTemplateSrc(): string {
    if (this.mode === 'watermark') {
      const key = this.orientation;
      if (this.watermarkSrcCache[key]) {
        return this.watermarkSrcCache[key];
      }
      const fileName =
        this.orientation === 'portrait' ? 'template-wm-ver.png' : 'template-wm-hor.png';
      if (!this.watermarkProcessing[key]) {
        this.watermarkProcessing[key] = true;
        this.processWatermarkTransparency(fileName, key);
      }
      return fileName; // 處理完成前先顯示原圖，避免空白
    }
    return 'template-' + this.orientation + '-wm.png';
  }

  private processWatermarkTransparency(fileName: string, cacheKey: string) {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = fileName;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        this.watermarkProcessing[cacheKey] = false;
        return;
      }

      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;

      // 白色門檻值：越高代表越接近白色才會被去除，可依實際圖片微調
      const threshold = 235;

      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];

        if (r >= threshold && g >= threshold && b >= threshold) {
          data[i + 3] = 0; // 完全透明
        } else {
          // 讓白->黑之間的灰色邊緣也做柔化，避免鋸齒
          const brightness = (r + g + b) / 3;
          const alpha = 1 - Math.min(1, Math.max(0, (brightness - 180) / (threshold - 180)));
          data[i + 3] = Math.round(alpha * 255);
        }
      }

      ctx.putImageData(imageData, 0, 0);
      this.watermarkSrcCache[cacheKey] = canvas.toDataURL('image/png');
      this.watermarkProcessing[cacheKey] = false;
    };
    img.onerror = () => {
      this.watermarkProcessing[cacheKey] = false;
    };
  }

  onModeChange() {
    this.resetUploadState();
  }

  onOrientationChange() {
    this.calculateContainerSize();
    this.resetUploadState();
  }

  // 計算預覽/擷取容器的實際像素寬高。
  // 桌機維持原本寫死的 400x600 / 600x400；
  // 手機則用「面板可用寬度」直接算出對應比例的高度，
  // 兩種情況最後都是明確的 px 數字，html2canvas 才能正確擷取。
  private calculateContainerSize() {
    const isMobile = window.innerWidth <= 768;

    if (!isMobile) {
      this.containerWidthPx = this.orientation === 'portrait' ? 400 : 600;
      this.containerHeightPx = this.orientation === 'portrait' ? 600 : 400;
      return;
    }

    const panelWidth =
      this.cardCaptureArea?.nativeElement.parentElement?.clientWidth ?? window.innerWidth * 0.85;

    if (this.orientation === 'portrait') {
      this.containerWidthPx = panelWidth;
      this.containerHeightPx = panelWidth * (3 / 2); // 4:6 = 2:3，高 = 寬 x 1.5
    } else {
      this.containerWidthPx = panelWidth;
      this.containerHeightPx = panelWidth * (2 / 3); // 6:4 = 3:2，高 = 寬 x 2/3
    }
  }

  private resetUploadState() {
    this.userImageSrc = null;
    this.imgElement = null;
    this.isImageLoaded = false;
    this.zoomValue = 100;
    this.imgLeft = 0;
    this.imgTop = 0;
    const fileInput = document.getElementById('image-input') as HTMLInputElement;
    if (fileInput) fileInput.value = '';
  }

  loadUserImage(event: any) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e: any) => {
      this.userImageSrc = e.target.result;
      this.imgElement = new Image();
      this.imgElement.src = e.target.result;
      this.imgElement.onload = () => {
        this.isImageLoaded = true;
        this.zoomValue = 100;
        this.currentScale = 1.0;
        this.resetImagePosition();
      };
    };
    reader.readAsDataURL(file);
  }

  private resetImagePosition() {
    if (!this.imgElement || !this.cardCaptureArea) return;

    const nw = this.imgElement.naturalWidth;
    const nh = this.imgElement.naturalHeight;
    const cW = this.cardCaptureArea.nativeElement.offsetWidth;
    const cH = this.cardCaptureArea.nativeElement.offsetHeight;

    const cRatio = cW / cH;
    const iRatio = nw / nh;

    if (iRatio > cRatio) {
      this.baseHeight = cH;
      this.baseWidth = cH * iRatio;
      this.imgLeft = (cW - this.baseWidth) / 2;
      this.imgTop = 0;
    } else {
      this.baseWidth = cW;
      this.baseHeight = cW / iRatio;
      this.imgLeft = 0;
      this.imgTop = (cH - this.baseHeight) / 2;
    }
    this.applyTransform();
    this.clampImagePosition();
  }
  handleZoom() {
    // baseWidth/baseHeight 已經是「剛好覆蓋畫布」的最小尺寸，
    // 縮放不可以小於 100%，否則四邊會露出空白造成報版
    if (this.zoomValue < 100) {
      this.zoomValue = 100;
    }
    this.currentScale = this.zoomValue / 100;
    this.applyTransform();
    this.clampImagePosition();
  }

  private applyTransform() {
    this.imgWidth = this.baseWidth * this.currentScale;
    this.imgHeight = this.baseHeight * this.currentScale;
  }

  // 限制圖片位置，確保拖曳/縮放後圖片仍完整覆蓋畫布，不會露出空白邊
  private clampImagePosition() {
    if (!this.cardCaptureArea) return;
    const cW = this.cardCaptureArea.nativeElement.offsetWidth;
    const cH = this.cardCaptureArea.nativeElement.offsetHeight;

    const minLeft = Math.min(0, cW - this.imgWidth);
    const minTop = Math.min(0, cH - this.imgHeight);

    this.imgLeft = Math.min(0, Math.max(minLeft, this.imgLeft));
    this.imgTop = Math.min(0, Math.max(minTop, this.imgTop));
  }

  onMouseDown(e: MouseEvent) {
    if (!this.isImageLoaded) return;
    this.isDragging = true;
    this.startX = e.clientX;
    this.startY = e.clientY;
    e.preventDefault();
  }

  onTouchStart(e: TouchEvent) {
    if (!this.isImageLoaded || e.touches.length !== 1) return;
    this.isDragging = true;
    this.startX = e.touches[0].clientX;
    this.startY = e.touches[0].clientY;
  }

  @HostListener('window:mousemove', ['$event'])
  onMouseMove(e: MouseEvent) {
    if (!this.isDragging) return;
    const dx = e.clientX - this.startX;
    const dy = e.clientY - this.startY;
    this.imgLeft += dx;
    this.imgTop += dy;
    this.clampImagePosition();
    this.startX = e.clientX;
    this.startY = e.clientY;
  }

  @HostListener('window:touchmove', ['$event'])
  onTouchMove(e: TouchEvent) {
    if (!this.isDragging || e.touches.length !== 1) return;
    const dx = e.touches[0].clientX - this.startX;
    const dy = e.touches[0].clientY - this.startY;
    this.imgLeft += dx;
    this.imgTop += dy;
    this.clampImagePosition();
    this.startX = e.touches[0].clientX;
    this.startY = e.touches[0].clientY;
  }

  @HostListener('window:mouseup')
  @HostListener('window:touchend')
  onDragEnd() {
    this.isDragging = false;
  }

  @HostListener('window:resize')
  onWindowResize() {
    // 記錄 resize 前的容器寬度，等新的容器尺寸套用到畫面上之後，
    // 依照寬度變化的比例，把已經定位好的照片（含縮放/位移）等比例
    // 重新換算，而不是只夾住位置——避免旋轉手機或縮放視窗後
    // 照片跟畫布比例對不起來、或露出空白邊。
    const oldWidth = this.cardCaptureArea?.nativeElement.offsetWidth || 0;

    this.calculateContainerSize();

    setTimeout(() => {
      const newWidth = this.cardCaptureArea?.nativeElement.offsetWidth || 0;

      if (this.isImageLoaded && oldWidth > 0 && newWidth > 0 && oldWidth !== newWidth) {
        const ratio = newWidth / oldWidth;
        this.baseWidth *= ratio;
        this.baseHeight *= ratio;
        this.imgWidth *= ratio;
        this.imgHeight *= ratio;
        this.imgLeft *= ratio;
        this.imgTop *= ratio;
      }

      if (this.isImageLoaded) {
        this.clampImagePosition();
      }
    }, 0);
  }

  async downloadCardImage() {
    if (!this.cardCaptureArea) return;

    const el = this.cardCaptureArea.nativeElement;

    const options: Partial<Options> = {
      scale: 4,
      useCORS: true,
      logging: false,
      backgroundColor: null,
      // 明確告訴 html2canvas 要擷取的尺寸，不要讓它自己用不支援的
      // CSS（如 aspect-ratio）去猜，避免手機版下載出來比例跑掉。
      width: el.offsetWidth,
      height: el.offsetHeight,
    };

    const canvas = await html2canvas(el, options);

    canvas.toBlob(async (blob: Blob | null) => {
      if (!blob) return;

      const fileName = `result_card_${new Date().getTime()}.png`;
      const file = new File([blob], fileName, { type: 'image/png' });

      // 手機且支援 Web Share API + 可分享檔案：走分享選單，讓使用者存到「照片」
      if (this.canShareFile(file)) {
        try {
          await navigator.share({
            files: [file],
            title: '圖卡',
          });
          return;
        } catch (err: any) {
          if (err?.name === 'AbortError') {
            // 使用者自己在分享選單按取消，不需要 fallback 下載
            return;
          }
          console.warn('分享失敗，改用下載', err?.name, err?.message);
        }
      }

      // 桌面瀏覽器或不支援分享的環境：走下載
      this.fallbackDownload(blob, fileName);
    }, 'image/png');
  }

  private canShareFile(file: File): boolean {
    return (
      typeof navigator !== 'undefined' &&
      !!navigator.share &&
      !!navigator.canShare &&
      navigator.canShare({ files: [file] })
    );
  }

  private fallbackDownload(blob: Blob, fileName: string) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = fileName;
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
  }
}
