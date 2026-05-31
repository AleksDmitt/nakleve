using System.Text.Json.Serialization;

namespace FishingApp.Api.DTOs.MapPoints;

public class YandexGeocoderResponse
{
    [JsonPropertyName("response")]
    public YandexGeocoderResponseBody? Response { get; set; }
}

public class YandexGeocoderResponseBody
{
    [JsonPropertyName("GeoObjectCollection")]
    public YandexGeoObjectCollection? GeoObjectCollection { get; set; }
}

public class YandexGeoObjectCollection
{
    [JsonPropertyName("featureMember")]
    public List<YandexFeatureMember>? FeatureMember { get; set; }
}

public class YandexFeatureMember
{
    [JsonPropertyName("GeoObject")]
    public YandexGeoObject? GeoObject { get; set; }
}

public class YandexGeoObject
{
    [JsonPropertyName("name")]
    public string? Name { get; set; }

    [JsonPropertyName("description")]
    public string? Description { get; set; }

    [JsonPropertyName("Point")]
    public YandexPoint? Point { get; set; }

    [JsonPropertyName("metaDataProperty")]
    public YandexMetaDataProperty? MetaDataProperty { get; set; }
}

public class YandexPoint
{
    [JsonPropertyName("pos")]
    public string? Pos { get; set; }
}

public class YandexMetaDataProperty
{
    [JsonPropertyName("GeocoderMetaData")]
    public YandexGeocoderMetaData? GeocoderMetaData { get; set; }
}

public class YandexGeocoderMetaData
{
    [JsonPropertyName("text")]
    public string? Text { get; set; }
}