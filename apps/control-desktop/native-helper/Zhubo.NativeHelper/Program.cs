using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Zhubo.NativeHelper;

internal static class Program
{
    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    public static int Main(string[] args)
    {
        try
        {
            if (args.Length == 0)
            {
                WriteJson(new { error = "missing command" });
                return 1;
            }

            var cmd = args[0].ToLowerInvariant();
            switch (cmd)
            {
                case "list-windows":
                    WriteJson(new { windows = Win32.EnumWindows() });
                    return 0;
                case "find-by-process":
                    var name = Arg(args, "--process") ?? Arg(args, "process") ?? (args.Length > 1 ? args[1] : null);
                    if (string.IsNullOrWhiteSpace(name))
                    {
                        WriteJson(new { error = "process name required" });
                        return 1;
                    }
                    WriteJson(new { windows = Win32.FindByProcess(name!) });
                    return 0;
                case "move-window":
                    return HandleMove(args);
                case "focus-window":
                    var hwndFocus = ParseHwnd(args);
                    if (hwndFocus == IntPtr.Zero) return 1;
                    Win32.SetForeground(hwndFocus);
                    WriteJson(new { ok = true });
                    return 0;
                case "set-top":
                    var hwndTop = ParseHwnd(args);
                    var val = Arg(args, "--value") == "1";
                    if (hwndTop == IntPtr.Zero) return 1;
                    Win32.SetTopmost(hwndTop, val);
                    WriteJson(new { ok = true });
                    return 0;
                default:
                    WriteJson(new { error = $"unknown command: {cmd}" });
                    return 1;
            }
        }
        catch (Exception ex)
        {
            WriteJson(new { error = ex.Message });
            return 1;
        }
    }

    private static int HandleMove(string[] args)
    {
        var x = int.Parse(Arg(args, "--x") ?? "0");
        var y = int.Parse(Arg(args, "--y") ?? "0");
        var w = int.Parse(Arg(args, "--width") ?? "800");
        var h = int.Parse(Arg(args, "--height") ?? "600");
        var hwnd = ParseHwnd(args);
        if (hwnd == IntPtr.Zero)
        {
            var pidStr = Arg(args, "--pid");
            var title = Arg(args, "--title");
            if (!string.IsNullOrEmpty(pidStr) && int.TryParse(pidStr, out var pid))
                hwnd = Win32.FindMainWindowByPid(pid);
            if (hwnd == IntPtr.Zero && !string.IsNullOrEmpty(title))
                hwnd = Win32.FindByTitle(title!);
        }
        if (hwnd == IntPtr.Zero)
        {
            WriteJson(new { error = "window not found" });
            return 1;
        }
        Win32.MoveWindow(hwnd, x, y, w, h);
        WriteJson(new { ok = true, hwnd = hwnd.ToInt64() });
        return 0;
    }

    private static IntPtr ParseHwnd(string[] args)
    {
        var s = Arg(args, "--hwnd");
        if (string.IsNullOrEmpty(s)) return IntPtr.Zero;
        return new IntPtr(long.Parse(s));
    }

    private static string? Arg(string[] args, string key)
    {
        for (var i = 0; i < args.Length - 1; i++)
            if (args[i].Equals(key, StringComparison.OrdinalIgnoreCase))
                return args[i + 1];
        return null;
    }

    private static void WriteJson(object obj)
    {
        Console.OutputEncoding = Encoding.UTF8;
        Console.WriteLine(JsonSerializer.Serialize(obj, JsonOpts));
    }
}

internal record WindowDto(
    long Hwnd,
    string Title,
    string ProcessName,
    int Pid,
    int X,
    int Y,
    int Width,
    int Height,
    bool Visible
);

internal static class Win32
{
    private delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    [DllImport("user32.dll")]
    private static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);

    [DllImport("user32.dll")]
    private static extern bool IsWindowVisible(IntPtr hWnd);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

    [DllImport("user32.dll")]
    private static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);

    [DllImport("user32.dll", SetLastError = true, EntryPoint = "MoveWindow")]
    private static extern bool MoveWindowWin32(IntPtr hWnd, int x, int y, int nWidth, int nHeight, bool bRepaint);

    [DllImport("user32.dll")]
    private static extern bool SetForegroundWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    private static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

    [DllImport("user32.dll")]
    private static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int x, int y, int cx, int cy, uint uFlags);

    [DllImport("user32.dll")]
    private static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

    private static readonly IntPtr HWND_TOPMOST = new(-1);
    private static readonly IntPtr HWND_NOTOPMOST = new(-2);
    private const int SW_RESTORE = 9;
    private const uint SWP_NOSIZE = 0x0001;
    private const uint SWP_NOMOVE = 0x0002;

    [StructLayout(LayoutKind.Sequential)]
    private struct RECT
    {
        public int Left, Top, Right, Bottom;
    }

    public static List<WindowDto> EnumWindows()
    {
        var list = new List<WindowDto>();
        EnumWindows((hWnd, _) =>
        {
            if (!IsWindowVisible(hWnd)) return true;
            var dto = ToDto(hWnd);
            if (dto != null && dto.Width > 50 && dto.Height > 50 && !string.IsNullOrWhiteSpace(dto.Title))
                list.Add(dto);
            return true;
        }, IntPtr.Zero);
        return list;
    }

    public static List<WindowDto> FindByProcess(string processName)
    {
        var key = processName.Replace(".exe", "", StringComparison.OrdinalIgnoreCase);
        return EnumWindows().Where(w =>
            w.ProcessName.Contains(key, StringComparison.OrdinalIgnoreCase) ||
            w.Title.Contains(processName, StringComparison.OrdinalIgnoreCase)
        ).ToList();
    }

    public static IntPtr FindMainWindowByPid(int pid)
    {
        IntPtr found = IntPtr.Zero;
        EnumWindows((hWnd, _) =>
        {
            GetWindowThreadProcessId(hWnd, out var wp);
            if ((int)wp == pid && IsWindowVisible(hWnd))
            {
                found = hWnd;
                return false;
            }
            return true;
        }, IntPtr.Zero);
        return found;
    }

    public static IntPtr FindByTitle(string title)
    {
        IntPtr found = IntPtr.Zero;
        EnumWindows((hWnd, _) =>
        {
            var sb = new StringBuilder(512);
            GetWindowText(hWnd, sb, sb.Capacity);
            if (sb.ToString().Contains(title, StringComparison.OrdinalIgnoreCase) && IsWindowVisible(hWnd))
            {
                found = hWnd;
                return false;
            }
            return true;
        }, IntPtr.Zero);
        return found;
    }

    public static void MoveWindow(IntPtr hwnd, int x, int y, int w, int h)
    {
        ShowWindow(hwnd, SW_RESTORE);
        MoveWindowWin32(hwnd, x, y, w, h, true);
    }

    public static void SetForeground(IntPtr hwnd)
    {
        ShowWindow(hwnd, SW_RESTORE);
        SetForegroundWindow(hwnd);
    }

    public static void SetTopmost(IntPtr hwnd, bool top)
    {
        SetWindowPos(hwnd, top ? HWND_TOPMOST : HWND_NOTOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE);
    }

    private static WindowDto? ToDto(IntPtr hWnd)
    {
        GetWindowThreadProcessId(hWnd, out var pid);
        var sb = new StringBuilder(512);
        GetWindowText(hWnd, sb, sb.Capacity);
        GetWindowRect(hWnd, out var rect);
        string procName = "";
        try { procName = Process.GetProcessById((int)pid).ProcessName; } catch { }
        return new WindowDto(
            hWnd.ToInt64(),
            sb.ToString(),
            procName,
            (int)pid,
            rect.Left,
            rect.Top,
            rect.Right - rect.Left,
            rect.Bottom - rect.Top,
            IsWindowVisible(hWnd)
        );
    }
}
