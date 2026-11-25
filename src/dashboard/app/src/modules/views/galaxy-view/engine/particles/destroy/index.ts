import { remnants } from "./remnants";
import { supernova } from "./supernova";
import { tear } from "./tear";

export const destroy = { ...supernova, ...tear, ...remnants };
