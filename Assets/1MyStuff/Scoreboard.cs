using System.Collections;
using UnityEngine;

public class Scoreboard : MonoBehaviour
{
    public TextMesh scoreBoard;
    public int hits;
    public int misses;
    public bool isPlaying;
    public GameObject spawner;
    public GameObject newGame;
    public AudioSource boom;
    public GameObject[] arenas;
    public GameObject self;
    private int _previousBeat;
    private float _songTime;


    private void Start()
    {
        isPlaying = false;
        hits = 0;
        misses = 0;
        UpdateText();
        RenderSettings.fog = false;
        _previousBeat = 0;
    }

    // Update is called once per frame
    private void FixedUpdate()
    {
        UpdateText();
    }

    public void IncreaseHits()
    {
        hits++;
        UpdateText();
    }

    public void IncreaseMisses()
    {
        misses++;
        UpdateText();
    }

    public void ResetScore()
    {
        hits = 0;
        misses = 0;
    }

    public void StartGame()
    {
        self.transform.position = new Vector3(-4.5f, 5, 25);
        isPlaying = true;
        boom.Play();
        Instantiate(spawner, new Vector3(0, 1.5f, 24.5f), Quaternion.identity);
        SetArena(1);
        RenderSettings.fog = true;
        _previousBeat = 0;
    }

    public void EndGame()
    {
        boom.Play();
        isPlaying = false;
        RenderSettings.fog = false;
        self.transform.position = new Vector3(-4.5f, 0, 5);

        StartCoroutine(StartNewGame());
    }

    private IEnumerator StartNewGame()
    {
        yield return new WaitForSeconds(10f);
        Instantiate(newGame, new Vector3(-0.625f, 1.25f, 1.25f), Quaternion.identity);
        SetArena(0);
    }

    public void NewGame()
    {
        isPlaying = false;
    }

    public void UpdateSongTime(int t)
    {
        _songTime = t;
        if (_previousBeat < t)
        {
            var rand = Random.Range(1, 6);
            SetArena(rand);
            _previousBeat = t;
        }
    }

    public void SetArena(int a)
    {
        foreach (var o in arenas)
            o.transform.position = new Vector3(1.5f, 50f, 0f);

        arenas[a].transform.position = new Vector3(1.5f, 10f, 0f);
    }


    private void UpdateText()
    {
        scoreBoard.text = "Score: " + (hits - misses);
    }
}
