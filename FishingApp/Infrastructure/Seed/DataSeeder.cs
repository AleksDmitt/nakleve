using FishingApp.Domain.Entities;
using FishingApp.Domain.Enums;
using FishingApp.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace FishingApp.Infrastructure.Seed;

public static class DataSeeder
{
    public static async Task SeedAsync(AppDbContext context)
    {
        await context.Database.MigrateAsync();

        await SeedChatsAsync(context);
    }

    private static async Task SeedChatsAsync(AppDbContext context)
    {
        var globalChatExists = await context.Chats
            .AnyAsync(x => x.Type == ChatType.Global && x.Name == "Общий чат");

        if (!globalChatExists)
        {
            context.Chats.Add(new Chat
            {
                Id = Guid.NewGuid(),
                Name = "Общий чат",
                Type = ChatType.Global,
                Region = null,
                CreatedAt = DateTime.UtcNow
            });

            await context.SaveChangesAsync();
        }
    }
}