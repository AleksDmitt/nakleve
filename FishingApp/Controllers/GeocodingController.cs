using System.Globalization;
using System.Text.Json;
using FishingApp.Api.DTOs.MapPoints;
using FishingApp.Api.Settings;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;

namespace FishingApp.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class GeocodingController : ControllerBase
{
    private const int MaxSearchQueryLength = 120;

    private readonly IHttpClientFactory _httpClientFactory;
    private readonly YandexMapsSettings _yandexMapsSettings;

    public GeocodingController(
        IHttpClientFactory httpClientFactory,
        IOptions<YandexMapsSettings> yandexMapsOptions)
    {
        _httpClientFactory = httpClientFactory;
        _yandexMapsSettings = yandexMapsOptions.Value;
    }

    [HttpGet("reverse")]
    public async Task<IActionResult> Reverse([FromQuery] double lat, [FromQuery] double lon)
    {
        if (!double.IsFinite(lat) || lat < -90 || lat > 90)
            return BadRequest(new { message = "Широта должна быть в диапазоне от -90 до 90." });

        if (!double.IsFinite(lon) || lon < -180 || lon > 180)
            return BadRequest(new { message = "Долгота должна быть в диапазоне от -180 до 180." });

        if (string.IsNullOrWhiteSpace(_yandexMapsSettings.GeocoderApiKey))
            return StatusCode(500, new { message = "Ключ геокодера не настроен." });

        var latString = lat.ToString(CultureInfo.InvariantCulture);
        var lonString = lon.ToString(CultureInfo.InvariantCulture);

        var url =
            $"https://geocode-maps.yandex.ru/1.x/" +
            $"?apikey={_yandexMapsSettings.GeocoderApiKey}" +
            $"&geocode={lonString},{latString}" +
            $"&lang=ru_RU" +
            $"&format=json" +
            $"&results=1";

        var client = _httpClientFactory.CreateClient();
        var response = await client.GetAsync(url, HttpContext.RequestAborted);
        var raw = await response.Content.ReadAsStringAsync(HttpContext.RequestAborted);

        if (!response.IsSuccessStatusCode)
        {
            return StatusCode(502, new
            {
                message = "Не удалось получить адрес от сервиса геокодирования."
            });
        }

        try
        {
            var data = JsonSerializer.Deserialize<YandexGeocoderResponse>(raw, new JsonSerializerOptions
            {
                PropertyNameCaseInsensitive = true
            });

            var address = data?
                .Response?
                .GeoObjectCollection?
                .FeatureMember?
                .FirstOrDefault()?
                .GeoObject?
                .MetaDataProperty?
                .GeocoderMetaData?
                .Text;

            if (string.IsNullOrWhiteSpace(address))
            {
                return Ok(new ReverseGeocodeResponse
                {
                    Address = string.Empty,
                    Region = null
                });
            }

            return Ok(new ReverseGeocodeResponse
            {
                Address = address,
                Region = ExtractRegion(address)
            });
        }
        catch (JsonException)
        {
            return StatusCode(502, new
            {
                message = "Сервис геокодирования вернул неожиданный формат ответа."
            });
        }
    }

    [HttpGet("search")]
    public async Task<IActionResult> Search([FromQuery] string query)
    {
        var normalizedQuery = NormalizeSearchQuery(query);

        if (string.IsNullOrWhiteSpace(normalizedQuery))
            return BadRequest(new { message = "Введите название места." });

        if (normalizedQuery.Length < 2)
            return BadRequest(new { message = "Введите минимум 2 символа для поиска." });

        if (string.IsNullOrWhiteSpace(_yandexMapsSettings.GeocoderApiKey))
            return StatusCode(500, new { message = "Ключ геокодера не настроен." });

        var url =
            $"https://geocode-maps.yandex.ru/1.x/" +
            $"?apikey={_yandexMapsSettings.GeocoderApiKey}" +
            $"&geocode={Uri.EscapeDataString(normalizedQuery)}" +
            $"&lang=ru_RU" +
            $"&format=json" +
            $"&results=5";

        var client = _httpClientFactory.CreateClient();
        var response = await client.GetAsync(url, HttpContext.RequestAborted);
        var raw = await response.Content.ReadAsStringAsync(HttpContext.RequestAborted);

        if (!response.IsSuccessStatusCode)
        {
            return StatusCode(502, new
            {
                message = "Не удалось выполнить поиск места."
            });
        }

        try
        {
            var data = JsonSerializer.Deserialize<YandexGeocoderResponse>(raw, new JsonSerializerOptions
            {
                PropertyNameCaseInsensitive = true
            });

            var items = data?
                .Response?
                .GeoObjectCollection?
                .FeatureMember?
                .Select(x => x.GeoObject)
                .Where(x => x != null && !string.IsNullOrWhiteSpace(x.Point?.Pos))
                .Select(x =>
                {
                    var parts = x!.Point!.Pos!.Split(' ', StringSplitOptions.RemoveEmptyEntries);

                    if (parts.Length != 2)
                        return null;

                    // Важно: Яндекс возвращает координаты как "longitude latitude"
                    var lonParsed = double.TryParse(
                        parts[0],
                        NumberStyles.Float,
                        CultureInfo.InvariantCulture,
                        out var longitude);

                    var latParsed = double.TryParse(
                        parts[1],
                        NumberStyles.Float,
                        CultureInfo.InvariantCulture,
                        out var latitude);

                    if (!latParsed || !lonParsed)
                        return null;

                    return new GeocodingSearchResult
                    {
                        Name = x.Name ?? normalizedQuery,
                        Description = x.Description,
                        Address = x.MetaDataProperty?.GeocoderMetaData?.Text,
                        Region = ExtractRegion(
                            x.MetaDataProperty?.GeocoderMetaData?.Text,
                            x.Name,
                            x.Description),
                        Latitude = latitude,
                        Longitude = longitude
                    };
                })
                .Where(x => x != null)
                .ToList();

            return Ok(items ?? new List<GeocodingSearchResult?>());
        }
        catch (JsonException)
        {
            return StatusCode(502, new
            {
                message = "Сервис геокодирования вернул неожиданный формат ответа."
            });
        }
    }

    private static string NormalizeSearchQuery(string? query)
    {
        var normalized = query?.Trim() ?? string.Empty;
        return normalized.Length <= MaxSearchQueryLength ? normalized : normalized[..MaxSearchQueryLength];
    }

    private static string? ExtractRegion(string? address, string? name = null, string? description = null)
    {
        var source = !string.IsNullOrWhiteSpace(address)
            ? address
            : !string.IsNullOrWhiteSpace(description)
                ? description
                : name;

        if (string.IsNullOrWhiteSpace(source))
            return null;

        var ignored = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            "Россия",
            "Республика Беларусь",
            "Беларусь",
            "Казахстан"
        };

        var parts = source
            .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .Where(x => !int.TryParse(x, out _))
            .Where(x => !ignored.Contains(x))
            .ToList();

        if (parts.Count == 0)
            return null;

        var cityLike = parts.FirstOrDefault(x =>
            x.StartsWith("г. ", StringComparison.OrdinalIgnoreCase) ||
            x.StartsWith("город ", StringComparison.OrdinalIgnoreCase) ||
            x.StartsWith("посёлок ", StringComparison.OrdinalIgnoreCase) ||
            x.StartsWith("поселок ", StringComparison.OrdinalIgnoreCase) ||
            x.StartsWith("деревня ", StringComparison.OrdinalIgnoreCase) ||
            x.StartsWith("село ", StringComparison.OrdinalIgnoreCase) ||
            x.StartsWith("пгт ", StringComparison.OrdinalIgnoreCase));

        return cityLike ?? parts.FirstOrDefault();
    }
}
