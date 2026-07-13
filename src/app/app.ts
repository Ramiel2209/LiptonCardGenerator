import { Component, ElementRef, ViewChild, HostListener } from '@angular/core';
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
export class App {
  @ViewChild('cardCaptureArea', { static: false }) cardCaptureArea!: ElementRef<HTMLDivElement>;

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

  private baseWidth: number = 0;
  private baseHeight: number = 0;
  private currentScale: number = 1.0;

  private isDragging: boolean = false;
  private startX: number = 0;
  private startY: number = 0;

  onOrientationChange() {
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
  }

  handleZoom() {
    this.currentScale = this.zoomValue / 100;
    this.applyTransform();
  }

  private applyTransform() {
    this.imgWidth = this.baseWidth * this.currentScale;
    this.imgHeight = this.baseHeight * this.currentScale;
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
    this.startX = e.touches[0].clientX;
    this.startY = e.touches[0].clientY;
  }

  @HostListener('window:mouseup')
  @HostListener('window:touchend')
  onDragEnd() {
    this.isDragging = false;
  }

  downloadCardImage() {
    if (!this.cardCaptureArea) return;

    const options: Partial<Options> = {
      scale: 2, // 提高解析度
      useCORS: true,
    };

    html2canvas(this.cardCaptureArea.nativeElement, options).then((canvas: HTMLCanvasElement) => {
      const link = document.createElement('a');
      link.download = `result_card_${new Date().getTime()}.jpg`;
      link.href = canvas.toDataURL('image/jpeg', 0.96);
      link.click();
    });
  }
}
