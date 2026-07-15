import * as React from "react"
import { ChartNoAxesCombined, Radar, ScrollText, Wallet } from "lucide-react"
import { useLocation } from "react-router"

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "~/components/ui/sidebar"

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const location = useLocation()
  const navigation = [
    {
      title: "工具",
      items: [
        { title: "价格监控", url: "/price-monitoring", icon: Radar, isActive: location.pathname === "/price-monitoring" },
        { title: "钱包", url: "/wallet", icon: Wallet, isActive: location.pathname === "/wallet" },
      ],
    },
    {
      title: "系统",
      items: [
        { title: "访问日志", url: "/access-logs", icon: ScrollText, isActive: location.pathname === "/access-logs" },
      ],
    },
  ]

  return (
    <Sidebar {...props}>
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-2 text-sm font-medium">
          <span className="flex size-7 items-center justify-center bg-primary text-primary-foreground">
            <ChartNoAxesCombined className="size-4" />
          </span>
          Dashboard
        </div>
      </SidebarHeader>
      <SidebarContent>
        {navigation.map((group) => (
          <SidebarGroup key={group.title}>
            <SidebarGroupLabel>{group.title}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      isActive={item.isActive}
                      render={<a href={item.url} />}
                    >
                      <item.icon />
                      {item.title}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  )
}
