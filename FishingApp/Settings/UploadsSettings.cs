namespace FishingApp.Api.Settings;

public class UploadsSettings
{
    public string? RootPath { get; set; }
    public string RequestPath { get; set; } = "/uploads";

    public string GetRootPath()
    {
        if (!string.IsNullOrWhiteSpace(RootPath))
            return RootPath;

        return Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "FishingAppUploads");
    }

    public string GetRequestPath()
    {
        var requestPath = string.IsNullOrWhiteSpace(RequestPath)
            ? "/uploads"
            : RequestPath.Trim();

        if (!requestPath.StartsWith('/'))
            requestPath = "/" + requestPath;

        return requestPath.TrimEnd('/');
    }
}
