import { BOARD, type BoardEvent, type Point, type Stroke } from '@wrible/contracts';

export class BoardRenderer {
  private readonly cache = document.createElement('canvas');
  private readonly cacheContext = this.cache.getContext('2d')!;
  private readonly context: CanvasRenderingContext2D;
  private readonly observer: ResizeObserver;
  private readonly surface: HTMLElement;
  private readonly strokes = new Map<number, Stroke>();
  private readonly pending = new Set<Stroke>();
  private frame: number | undefined;
  private scale = 0;
  private resolution = 0;
  private completeCount = 0;
  private cachedPoints = 0;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.context = canvas.getContext('2d')!;
    this.surface = canvas.parentElement!;
    this.observer = new ResizeObserver(() => this.schedule());
    this.observer.observe(this.surface);
    window.addEventListener('resize', this.schedule);
  }

  update(event: BoardEvent): boolean {
    switch (event.type) {
      case 'snapshot':
        this.strokes.clear();
        this.completeCount = 0;
        for (const stroke of event.strokes) {
          this.strokes.set(stroke.id, stroke);
          if (stroke.complete) this.completeCount++;
        }
        this.resetCache();
        break;
      case 'begin':
        this.strokes.set(event.stroke.id, event.stroke);
        this.pending.add(event.stroke);
        break;
      case 'points':
        this.strokes.get(event.id)?.points.push(...event.points);
        break;
      case 'end': {
        const stroke = this.strokes.get(event.id);
        if (stroke && !stroke.complete) {
          stroke.complete = true;
          this.completeCount++;
        }
        break;
      }
      case 'remove':
        if (this.strokes.delete(event.id)) this.completeCount--;
        this.resetCache();
        break;
      case 'clear':
        this.strokes.clear();
        this.completeCount = 0;
        this.resetCache();
        break;
      default:
        return this.completeCount > 0;
    }
    this.schedule();
    return this.completeCount > 0;
  }

  dispose() {
    this.observer.disconnect();
    window.removeEventListener('resize', this.schedule);
    if (this.frame !== undefined) cancelAnimationFrame(this.frame);
  }

  private resetCache() {
    this.cacheContext.clearRect(0, 0, this.cache.width, this.cache.height);
    this.cachedPoints = 0;
    this.pending.clear();
    for (const stroke of this.strokes.values()) this.pending.add(stroke);
  }

  private schedule = () => {
    if (this.frame === undefined) this.frame = requestAnimationFrame(this.render);
  };

  private render = () => {
    this.frame = undefined;
    const scale = Math.min(this.surface.clientWidth / BOARD.width, this.surface.clientHeight / BOARD.height);
    if (!scale) return;
    if (this.scale !== scale) {
      this.scale = scale;
      this.canvas.style.width = `${BOARD.width * scale}px`;
      this.canvas.style.height = `${BOARD.height * scale}px`;
    }
    const resolution = Math.min(2.5, scale * window.devicePixelRatio);

    if (this.resolution !== resolution) {
      this.resolution = resolution;
      this.canvas.width = this.cache.width = Math.round(BOARD.width * resolution);
      this.canvas.height = this.cache.height = Math.round(BOARD.height * resolution);
      this.resetCache();
    }

    // Append points through the first active stroke. Later strokes must remain above it.
    for (const stroke of this.pending) {
      drawStroke(this.cacheContext, stroke, this.resolution, this.cachedPoints);
      this.cachedPoints = stroke.points.length;
      if (!stroke.complete) break;
      this.cachedPoints = 0;
      this.pending.delete(stroke);
    }

    this.context.globalCompositeOperation = 'source-over';
    this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.context.drawImage(this.cache, 0, 0);
    let first = true;
    for (const stroke of this.pending) {
      if (!first) drawStroke(this.context, stroke, this.resolution);
      first = false;
    }
  };
}

function drawStroke(ctx: CanvasRenderingContext2D, { brush, points }: Stroke, scale: number, start = 0) {
  if (start === points.length) return;
  const { width, height } = ctx.canvas;
  const size = (point: Point) => brush.width * scale * (0.35 + 1.3 * point.pressure);
  ctx.globalCompositeOperation = brush.tool === 'eraser' ? 'destination-out' : 'source-over';
  ctx.fillStyle = ctx.strokeStyle = brush.tool === 'eraser' ? '#000000' : brush.color;
  ctx.lineCap = 'round';

  if (!start) {
    const first = points[0];
    ctx.beginPath();
    ctx.arc(first.x * width, first.y * height, size(first) / 2, 0, Math.PI * 2);
    ctx.fill();
  }

  for (let i = Math.max(1, start); i < points.length; i++) {
    const from = points[i - 1];
    const to = points[i];
    ctx.lineWidth = (size(from) + size(to)) / 2;
    if (from.x === to.x && from.y === to.y) continue;
    ctx.beginPath();
    ctx.moveTo(from.x * width, from.y * height);
    ctx.lineTo(to.x * width, to.y * height);
    ctx.stroke();
  }
}
