<#
ТЕЛЕГРАМ ВАКАНСИИ - ПРОФЕССИОНАЛЬНАЯ ОБРАБОТКА
Версия: 3.0 - Исправленные заголовки по требованиям Конрада
#>

# ============================================
# КОНФИГУРАЦИЯ
# ============================================
$USE_MOCK_API = $true
$jsonFilePath = "C:\Users\pasaz\WebstormProjects\TgCrawler\data\jobs_2026-01-17_10-34-04.json"
$SENT_JOBS_DB = "sent_jobs_database.json"
$LOG_FILE = "processing_log.txt"
$MAX_JOBS_TO_PROCESS = 15  # Сколько вакансий обрабатывать за раз

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "ПРОФЕССИОНАЛЬНАЯ ОБРАБОТКА ТЕЛЕГРАМ ВАКАНСИЙ" -ForegroundColor Cyan
Write-Host "Версия: 3.0 - Исправленные заголовки" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# ============================================
# УТИЛИТЫ ДЛЯ ОЧИСТКИ
# ============================================

# Полная очистка от эмодзи и мусора
function Remove-EmojiAndGarbage {
    param([string]$Text)
    
    if ([string]::IsNullOrWhiteSpace($Text)) { return "" }
    
    # Удаляем все эмодзи и не-ASCII символы (кроме кириллицы и базовых латинских)
    $text = $Text -replace '[^\x00-\x7F\u0400-\u04FF\s]', ' '
    
    # Удаляем маркеры задач и лишние символы
    $patterns = @(
        'Тип работы:\s*', 
        'Задача:\s*', 
        'Бюджет:\s*',
        'Оплата:\s*',
        'Цена:\s*',
        'Стоимость:\s*',
        'Deadline:\s*',
        'Срок:\s*'
    )
    
    foreach ($pattern in $patterns) {
        $text = $text -replace $pattern, ''
    }
    
    # Удаляем хештеги но сохраняем слова
    $text = $text -replace '#(\w+)', '$1'
    
    # Чистим пробелы
    $text = $text -replace '\s+', ' '
    $text = $text.Trim()
    
    return $text
}

# ПРАВИЛЬНАЯ функция для заголовков
# ПРАВИЛЬНАЯ функция для заголовков (как хочет Конрад)
function Get-CleanTitle {
    param([string]$RawTitle, [string]$RawDescription)
    
    if ([string]::IsNullOrWhiteSpace($RawTitle)) { return "Нужно выполнить задачу" }
    
    # Ищем технологию в тексте
    $allText = ($RawTitle + " " + $RawDescription).ToLower()
    
    # Определяем технологии
    $tech = ""
    if ($allText -match '(python|питон|django|flask)') { $tech = "Python" }
    elseif ($allText -match '(javascript|js|react|vue|angular)') { $tech = "JavaScript" }
    elseif ($allText -match '(php|wordpress|битрикс)') { $tech = "PHP" }
    elseif ($allText -match '(unreal|ue5|ue4)') { $tech = "Unreal Engine" }
    elseif ($allText -match '(c#|\.net|asp\.net)') { $tech = "C#" }
    elseif ($allText -match '(java|android)') { $tech = "Java" }
    elseif ($allText -match '(html|css|верстк)') { $tech = "HTML/CSS" }
    
    # Определяем тип задачи
    $taskType = ""
    if ($allText -match '(интерфейс|ui|ux|виджет)') { $taskType = "интерфейс" }
    elseif ($allText -match '(сайт|веб|web|лендинг)') { $taskType = "сайт" }
    elseif ($allText -match '(бот|telegram)') { $taskType = "бота" }
    elseif ($allText -match '(игр|game|3d|2d)') { $taskType = "игру" }
    elseif ($allText -match '(приложен|app|мобильн)') { $taskType = "приложение" }
    elseif ($allText -match '(парс|scrap|краул)') { $taskType = "парсер" }
    elseif ($allText -match '(автоматизац|automation)') { $taskType = "автоматизацию" }
    elseif ($allText -match '(алгоритм|программ|код)') { $taskType = "программу" }
    elseif ($allText -match '(дизайн|figma)') { $taskType = "дизайн" }
    elseif ($allText -match '(api|интеграц)') { $taskType = "интеграцию API" }
    else { $taskType = "задачу" }
    
    # Формируем заголовок как хочет Конрад
    if ($tech -ne "") {
        if ($taskType -eq "задачу") {
            return "Требуется разработка на $tech"
        } else {
            return "Требуется $taskType на $tech"
        }
    } else {
        return "Требуется $taskType"
    }
}

# Извлекаем ЧИСТОЕ описание
function Get-CleanDescription {
    param([string]$Title, [string]$RawDescription)
    
    $cleanDesc = Remove-EmojiAndGarbage -Text $RawDescription
    
    # Убираем URL из описания
    $urlPattern = 'https?://[^\s]+'
    $cleanDesc = [regex]::Replace($cleanDesc, $urlPattern, '')
    
    # Убираем повтор заголовка в начале описания
    $cleanTitleWords = $Title.Split(' ', [StringSplitOptions]::RemoveEmptyEntries)
    if ($cleanTitleWords.Count -ge 2) {
        $firstTitlePart = ($cleanTitleWords[0..1] -join ' ')
        if ($cleanDesc.StartsWith($firstTitlePart)) {
            $cleanDesc = $cleanDesc.Substring($firstTitlePart.Length).Trim()
        }
    }
    
    # Убираем дублирование "Задача: Задача:"
    $cleanDesc = $cleanDesc -replace '(Задача:|Task:|Описание:|Description:)\s*\1', '$1'
    
    # Убираем фразы про оплату и бюджет
    $moneyPatterns = @(
        'От\s+\d+.*до\s+\d+.*',
        'от\s+\d+.*до\s+\d+.*',
        'Оплата на любую карту.*',
        'Цена:.*',
        'Бюджет:.*',
        'Оплата:.*',
        'Стоимость:.*',
        'руб.*',
        '₽.*'
    )
    
    foreach ($pattern in $moneyPatterns) {
        $cleanDesc = $cleanDesc -replace $pattern, ''
    }
    
    # Чистим от лишних переносов строк
    $cleanDesc = $cleanDesc -replace '\n+', ' '
    $cleanDesc = $cleanDesc -replace '\r+', ' '
    
    # Обрезаем до 400 символов
    if ($cleanDesc.Length -gt 400) {
        $cleanDesc = $cleanDesc.Substring(0, 400)
        $lastPeriod = $cleanDesc.LastIndexOf('.')
        if ($lastPeriod -gt 300) {
            $cleanDesc = $cleanDesc.Substring(0, $lastPeriod + 1)
        }
    }
    
    # Убираем двойные пробелы
    $cleanDesc = $cleanDesc -replace '\s+', ' '
    
    return $cleanDesc.Trim()
}

# Извлекаем бюджет из текста
function Extract-Budget {
    param([string]$Text)
    
    $budgetFrom = $null
    $budgetTo = $null
    
    # Паттерны для поиска бюджета
    $patterns = @(
        'от\s*(\d+(?:[\s.,]\d+)*)\s*до\s*(\d+(?:[\s.,]\d+)*)',  # от 60,000 до 180,000
        '(\d+(?:[\s.,]\d+)*)\s*[-]\s*(\d+(?:[\s.,]\d+)*)',       # 60000-180000
        'budget[:\s]*(\d+(?:[\s.,]\d+)*)\s*[-]\s*(\d+(?:[\s.,]\d+)*)',
        'цена[:\s]*(\d+(?:[\s.,]\d+)*)\s*[-]\s*(\d+(?:[\s.,]\d+)*)',
        'оплата[:\s]*(\d+(?:[\s.,]\d+)*)\s*[-]\s*(\d+(?:[\s.,]\d+)*)',
        'стоимость[:\s]*(\d+(?:[\s.,]\d+)*)\s*[-]\s*(\d+(?:[\s.,]\d+)*)'
    )
    
    foreach ($pattern in $patterns) {
        if ($Text -match $pattern) {
            try {
                $from = $matches[1] -replace '[^\d]', ''
                $to = $matches[2] -replace '[^\d]', ''
                
                $budgetFrom = [int]$from
                $budgetTo = [int]$to
                
                # Меняем местами если from > to
                if ($budgetFrom -gt $budgetTo) {
                    $temp = $budgetFrom
                    $budgetFrom = $budgetTo
                    $budgetTo = $temp
                }
                
                break
            } catch { continue }
        }
    }
    
    # Если нашли только один бюджет
    if ($null -eq $budgetFrom -and $Text -match '(\d+(?:[\s.,]\d+){3,})') {
        try {
            $singleBudget = $matches[1] -replace '[^\d]', ''
            $budgetFrom = [int]$singleBudget
            $budgetTo = $budgetFrom
        } catch { }
    }
    
    return @{
        From = $budgetFrom
        To = $budgetTo
    }
}

# Определяем теги по содержанию
function Get-IntelligentTags {
    param([string]$Title, [string]$Description)
    
    $text = ($Title + " " + $Description).ToLower()
    $tags = New-Object System.Collections.Generic.List[string]
    
    # Обязательный тег
    $tags.Add("freelance")
    
    # Определяем категорию
    if ($text -match '(программир|код|разработк|developer|dev|software|софт)') { 
        $tags.Add("development") 
    }
    
    # Технологии и специализации
    if ($text -match '(python|питон|django|flask)') { $tags.Add("python") }
    if ($text -match '(javascript|js|react|vue|angular|node)') { $tags.Add("javascript") }
    if ($text -match '(php|wordpress|битрикс|laravel)') { $tags.Add("php") }
    if ($text -match '(unreal|ue5|ue4)') { $tags.Add("unreal") }
    if ($text -match '(игр|game|gamedev|3d|2d)') { $tags.Add("gamedev") }
    if ($text -match '(верстк|вёрстк|html|css|frontend)') { $tags.Add("frontend") }
    if ($text -match '(api|интеграц|бэкенд|backend|сервер)') { $tags.Add("backend") }
    if ($text -match '(бот|telegram|тг)') { $tags.Add("telegram") }
    if ($text -match '(дизайн|figma|photoshop)') { $tags.Add("design") }
    if ($text -match '(seo|продвижен|оптимизац)') { $tags.Add("seo") }
    if ($text -match '(автоматизац|automation|скрипт)') { $tags.Add("automation") }
    if ($text -match '(сайт|web|веб|лендинг)') { $tags.Add("web") }
    if ($text -match '(баз данных|sql|mysql|postgresql)') { $tags.Add("database") }
    
    # Mobile только если явно указано
    if ($text -match '(ios|android|мобильн|react native|flutter)') { 
        $tags.Add("mobile")
    }
    
    # Ограничиваем количество тегов
    if ($tags.Count -gt 6) {
        $tags = $tags | Select-Object -First 6
    }
    
    return $tags
}

# Определяем дедлайн (в днях)
function Estimate-Deadline {
    param([string]$Text)
    
    $text = $Text.ToLower()
    
    # Паттерны сроков
    if ($text -match '(срочн|urgent|как можно быстрее|немедленно)') { return 1 }
    if ($text -match '(за выходные|за неделю|в течение недели)') { return 7 }
    if ($text -match '(за месяц|в течение месяца|30 дней|месяц)') { return 30 }
    if ($text -match '(2 недели|14 дней|полмесяца)') { return 14 }
    if ($text -match '(3 дня|72 часа)') { return 3 }
    if ($text -match '(1[-\s]2 дня|24-48 часов)') { return 2 }
    if ($text -match '(долгосрочн|постоянн|permanent)') { return 90 }
    
    # По умолчанию - 30 дней
    return 30
}

# Парсим URL канала
function Parse-ChannelUrl {
    param([string]$Url)
    
    if ([string]::IsNullOrWhiteSpace($Url)) { return $null }
    
    # Извлекаем название канала из URL
    if ($Url -match 'https?://t\.me/([^/?]+)') {
        return "https://t.me/$($matches[1])"
    }
    
    return $Url
}

# ============================================
# ОБРАБОТКА JSON СТРУКТУРЫ
# ============================================

function ConvertTo-StructuredJob {
    param($RawJob)
    
    # 1. Чистый заголовок
    $cleanTitle = Get-CleanTitle -RawTitle $RawJob.title
    
    # 2. Чистое описание
    $cleanDesc = Get-CleanDescription -Title $cleanTitle -RawDescription $RawJob.description
    
    # 3. Бюджет
    $fullText = $cleanTitle + " " + $cleanDesc
    $budget = Extract-Budget -Text $fullText
    
    # 4. Теги
    $tags = Get-IntelligentTags -Title $cleanTitle -Description $cleanDesc
    
    # 5. Дедлайн
    $deadline = Estimate-Deadline -Text $cleanDesc
    
    # 6. URL канала
    $channelUrl = Parse-ChannelUrl -Url $RawJob.channelUrl
    
    # Создаем структурированный объект
    $structuredJob = [PSCustomObject]@{
        id = $RawJob.id
        title = $cleanTitle
        description = $cleanDesc
        budget_from = $budget.From
        budget_to = $budget.To
        tags = $tags
        deadline = $deadline
        url = $RawJob.url
        channelUrl = $channelUrl
        scrapedAt = $RawJob.scrapedAt
        processed_at = (Get-Date -Format "yyyy-MM-ddTHH:mm:ss.fffZ")
    }
    
    return $structuredJob
}

# ============================================
# БАЗА ДАННЫХ ОТПРАВЛЕННЫХ
# ============================================

function Get-SentJobsDB {
    if (-not (Test-Path $SENT_JOBS_DB)) {
        return @{}
    }
    
    try {
        $content = Get-Content $SENT_JOBS_DB -Raw -Encoding UTF8
        return $content | ConvertFrom-Json -AsHashtable
    } catch {
        return @{}
    }
}

function Save-ToSentDB {
    param($JobId, $TaskId)
    
    $db = Get-SentJobsDB
    if (-not $db) { $db = @{} }
    
    $db[$JobId] = @{
        task_id = $TaskId
        sent_date = (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
        status = "sent"
    }
    
    $db | ConvertTo-Json -Depth 3 | Out-File $SENT_JOBS_DB -Encoding UTF8
}

function Is-JobSent {
    param([string]$JobId)
    
    $db = Get-SentJobsDB
    return $db.ContainsKey($JobId)
}

# ============================================
# МОК API ОТПРАВКИ
# ============================================

function Mock-SendToAPI {
    param($StructuredJob)
    
    Write-Host "  Отправка на API..." -NoNewline -ForegroundColor Cyan
    
    # Имитируем задержку сети
    Start-Sleep -Milliseconds (Get-Random -Minimum 200 -Maximum 800)
    
    # Генерируем ID задачи
    $taskId = "task_" + (Get-Date -Format "yyyyMMddHHmmss") + "_" + (Get-Random -Minimum 1000 -Maximum 9999)
    
    Write-Host " [MOCK]" -NoNewline -ForegroundColor Yellow
    Write-Host " OK" -ForegroundColor Green
    
    return @{
        success = $true
        task_id = $taskId
        message = "Задача успешно создана"
    }
}

# ============================================
# ЛОГИРОВАНИЕ
# ============================================

function Write-Log {
    param([string]$Message, [string]$Level = "INFO")
    
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $logMessage = "[$timestamp] [$Level] $Message"
    
    Add-Content -Path $LOG_FILE -Value $logMessage -Encoding UTF8
    
    switch ($Level) {
        "ERROR" { Write-Host $logMessage -ForegroundColor Red }
        "WARN"  { Write-Host $logMessage -ForegroundColor Yellow }
        "SUCCESS" { Write-Host $logMessage -ForegroundColor Green }
        default { Write-Host $logMessage -ForegroundColor Gray }
    }
}

# ============================================
# ОСНОВНОЙ ПРОЦЕСС
# ============================================

# Инициализация лога
"=== Начало обработки ===" | Out-File $LOG_FILE -Encoding UTF8

# Проверка файла
if (-not (Test-Path $jsonFilePath)) {
    Write-Log "Файл не найден: $jsonFilePath" -Level "ERROR"
    exit 1
}

# Загрузка вакансий
try {
    $jsonContent = Get-Content -Path $jsonFilePath -Raw -Encoding UTF8
    $rawJobs = $jsonContent | ConvertFrom-Json
    Write-Log "Загружено $($rawJobs.Count) вакансий" -Level "SUCCESS"
} catch {
    Write-Log "Ошибка загрузки JSON: $_" -Level "ERROR"
    exit 1
}

# Фильтруем только программистские вакансии
$techJobs = @()
foreach ($job in $rawJobs) {
    $text = ($job.title + " " + $job.description).ToLower()
    $techKeywords = @('программир', 'разработ', 'developer', 'dev', 'код', 'software', 
                     'it', 'айти', 'тех', 'tech', 'инженер', 'engineer', 'систем')
    
    $isTech = $false
    foreach ($keyword in $techKeywords) {
        if ($text -match $keyword) {
            $isTech = $true
            break
        }
    }
    
    if ($isTech) {
        $techJobs += $job
    }
}

Write-Log "Найдено $($techJobs.Count) технических вакансий" -Level "INFO"

# Ограничиваем количество для обработки
$jobsToProcess = $techJobs | Select-Object -First $MAX_JOBS_TO_PROCESS
Write-Log "Будет обработано: $($jobsToProcess.Count) вакансий" -Level "INFO"
Write-Host ""

# Статистика
$stats = @{
    total = $jobsToProcess.Count
    sent = 0
    skipped = 0
    errors = 0
}

$results = @()
$counter = 0
$processedIds = @()

foreach ($rawJob in $jobsToProcess) {
    $counter++
    $jobNumber = "[$counter/$($jobsToProcess.Count)]"
    
    Write-Host $jobNumber -NoNewline -ForegroundColor Cyan
    Write-Host " ID: $($rawJob.id)" -ForegroundColor White
    
    # Проверка на дубли в этой сессии
    if ($processedIds -contains $rawJob.id) {
        Write-Host "  Дубликат в сессии, пропускаем" -ForegroundColor DarkGray
        $stats.skipped++
        Write-Log "Пропущена (дубликат в сессии): $($rawJob.id)" -Level "WARN"
        Write-Host ""
        continue
    }
    $processedIds += $rawJob.id
    
    # Проверка в базе данных
    if (Is-JobSent -JobId $rawJob.id) {
        Write-Host "  Уже отправлена ранее, пропускаем" -ForegroundColor DarkGray
        $stats.skipped++
        Write-Log "Пропущена (отправлена ранее): $($rawJob.id)" -Level "WARN"
        Write-Host ""
        continue
    }
    
    try {
        # 1. Структурируем данные
        Write-Host "  Структурирование..." -NoNewline -ForegroundColor Cyan
        $structuredJob = ConvertTo-StructuredJob -RawJob $rawJob
        Write-Host " OK" -ForegroundColor Green
        
        # 2. Показываем результат
        Write-Host "  Заголовок: " -NoNewline -ForegroundColor Gray
        Write-Host "$($structuredJob.title)" -ForegroundColor White
        
        if ($structuredJob.budget_from -or $structuredJob.budget_to) {
            Write-Host "  Бюджет: " -NoNewline -ForegroundColor Gray
            Write-Host "$($structuredJob.budget_from) - $($structuredJob.budget_to) руб" -ForegroundColor Green
        }
        
        Write-Host "  Теги: " -NoNewline -ForegroundColor Gray
        Write-Host "$($structuredJob.tags -join ', ')" -ForegroundColor Magenta
        
        Write-Host "  Дедлайн: " -NoNewline -ForegroundColor Gray
        Write-Host "$($structuredJob.deadline) дней" -ForegroundColor Yellow
        
        # 3. Отправляем на API
        $apiResult = Mock-SendToAPI -StructuredJob $structuredJob
        
        if ($apiResult.success) {
            # 4. Сохраняем в базу
            Save-ToSentDB -JobId $rawJob.id -TaskId $apiResult.task_id
            
            # 5. Сохраняем результат
            $result = [PSCustomObject]@{
                JobId = $rawJob.id
                TaskId = $apiResult.task_id
                Title = $structuredJob.title
                Budget = if ($structuredJob.budget_from) { "$($structuredJob.budget_from)-$($structuredJob.budget_to)" } else { "нет" }
                Tags = $structuredJob.tags -join ', '
                Deadline = $structuredJob.deadline
                Status = "success"
                Timestamp = (Get-Date -Format "HH:mm:ss")
            }
            
            $results += $result
            $stats.sent++
            
            Write-Log "Успешно отправлена: $($rawJob.id) -> $($apiResult.task_id)" -Level "SUCCESS"
            
            # 6. Сохраняем структурированный JSON для проверки
            $checkFile = "structured_$($rawJob.id).json"
            $structuredJob | ConvertTo-Json -Depth 5 | Out-File $checkFile -Encoding UTF8
            Write-Host "  Сохранен: $checkFile" -ForegroundColor DarkGray
        }
        
    } catch {
        Write-Host "  Ошибка: $_" -ForegroundColor Red
        $stats.errors++
        Write-Log "Ошибка обработки $($rawJob.id): $_" -Level "ERROR"
    }
    
    Write-Host ""
    
    # Пауза между запросами
    if ($counter -lt $jobsToProcess.Count) {
        Start-Sleep -Milliseconds 300
    }
}

# ============================================
# ФИНАЛЬНЫЙ ОТЧЕТ
# ============================================

Write-Host "==========================================" -ForegroundColor Green
Write-Host "ФИНАЛЬНЫЙ ОТЧЕТ" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green
Write-Host ""

Write-Host "Обработано вакансий: " -NoNewline -ForegroundColor White
Write-Host "$($stats.total)" -ForegroundColor Cyan

Write-Host "Успешно отправлено: " -NoNewline -ForegroundColor White
Write-Host "$($stats.sent)" -ForegroundColor Green

Write-Host "Пропущено (дубли): " -NoNewline -ForegroundColor White
Write-Host "$($stats.skipped)" -ForegroundColor Yellow

Write-Host "Ошибок: " -NoNewline -ForegroundColor White
Write-Host "$($stats.errors)" -ForegroundColor $(if ($stats.errors -eq 0) { "Gray" } else { "Red" })

# Статистика по тегам
if ($results.Count -gt 0) {
    Write-Host ""
    Write-Host "СТАТИСТИКА ПО ТЕГАМ:" -ForegroundColor Cyan
    
    $tagStats = @{}
    foreach ($result in $results) {
        $tagArray = $result.Tags.Split(', ', [StringSplitOptions]::RemoveEmptyEntries)
        foreach ($tag in $tagArray) {
            $cleanTag = $tag.Trim()
            if (-not [string]::IsNullOrWhiteSpace($cleanTag)) {
                if ($tagStats.ContainsKey($cleanTag)) {
                    $tagStats[$cleanTag]++
                } else {
                    $tagStats[$cleanTag] = 1
                }
            }
        }
    }
    
    $sortedTags = $tagStats.GetEnumerator() | Sort-Object Value -Descending
    foreach ($tag in $sortedTags) {
        $percent = [math]::Round(($tag.Value / $results.Count) * 100)
        $barLength = [math]::Round($percent / 5)
        $bar = "#" * $barLength + " " * (20 - $barLength)
        Write-Host ("  {0,-15} {1,3} [{2}] {3}%" -f $tag.Key, $tag.Value, $bar, $percent)
    }
}

# Сохраняем полный отчет
$reportFile = "full_report_$(Get-Date -Format 'yyyyMMdd_HHmmss').json"
$report = @{
    timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    statistics = $stats
    processed_jobs = $results
    total_in_database = (Get-SentJobsDB).Count
}

$report | ConvertTo-Json -Depth 4 | Out-File $reportFile -Encoding UTF8

Write-Host ""
Write-Host "Отчет сохранен: " -NoNewline -ForegroundColor White
Write-Host $reportFile -ForegroundColor Cyan

# Показываем пример структурированной вакансии
if ($results.Count -gt 0) {
    Write-Host ""
    Write-Host "ПРИМЕР СТРУКТУРИРОВАННОЙ ВАКАНСИИ:" -ForegroundColor Cyan
    Write-Host "==========================================" -ForegroundColor DarkGray
    
    $structuredExample = ConvertTo-StructuredJob -RawJob $jobsToProcess[0]
    
    $exampleJson = $structuredExample | ConvertTo-Json -Depth 3
    Write-Host $exampleJson -ForegroundColor DarkGray
    
    Write-Host ""
    Write-Host "Пример заголовка: " -NoNewline -ForegroundColor Cyan
    Write-Host $structuredExample.title -ForegroundColor White
}

Write-Host ""
Write-Host "==========================================" -ForegroundColor Green
Write-Host "ВЫПОЛНЕНО! Заголовки исправлены" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green