/* eslint-disable @typescript-eslint/no-unused-vars, unused-imports/no-unused-vars */
import "react";

declare module "react" {
  // Augment React's HTMLAttributes so `inert` can be used in JSX without casts.
  interface HTMLAttributes<T> {
    inert?: boolean;
  }
}
