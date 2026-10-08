import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";

import { cn } from "@/lib/utils";

const Tabs = TabsPrimitive.Root;

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      "inline-flex h-10 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground",
      className,
    )}
    {...props}
  />
));
TabsList.displayName = TabsPrimitive.List.displayName;

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => {
  const innerRef = React.useRef<HTMLButtonElement>(null);
  React.useImperativeHandle(ref, () => innerRef.current as HTMLButtonElement);
  const etaitActif = React.useRef(false);

  // Dans une barre défilante (.tabs-scroll), amène l'onglet qui devient actif
  // au centre de la barre pour qu'il reste visible.
  React.useEffect(() => {
    const el = innerRef.current;
    const actif = el?.dataset.state === "active";
    if (el && actif && !etaitActif.current) {
      const barre = el.parentElement;
      if (barre?.classList.contains("tabs-scroll") && barre.scrollWidth > barre.clientWidth) {
        const decalage = el.getBoundingClientRect().left - barre.getBoundingClientRect().left;
        barre.scrollTo({ left: barre.scrollLeft + decalage - (barre.clientWidth - el.offsetWidth) / 2, behavior: "smooth" });
      }
    }
    etaitActif.current = actif;
  });

  return (
    <TabsPrimitive.Trigger
      ref={innerRef}
      className={cn(
        "inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
});
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      className,
    )}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { Tabs, TabsList, TabsTrigger, TabsContent };
