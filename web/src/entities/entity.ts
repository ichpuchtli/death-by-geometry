import { Vec2 } from '../core/vector';
import type { Renderer } from '../renderer/sprite-batch';

export abstract class Entity {
  position = new Vec2(0, 0);
  velocity = new Vec2(0, 0);
  rotation = 0;
  active = true;
  collisionRadius = 20;

  abstract update(dt: number): void;
  abstract render(renderer: Renderer): void;

  /** Move by velocity * dt */
  move(dt: number): void {
    this.position.addScaledMut(this.velocity, dt);
  }
}
