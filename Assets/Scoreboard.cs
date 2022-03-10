using UnityEngine;

public class Scoreboard : MonoBehaviour
{
    public TextMesh scoreBoard;
    public int hits;
    public int misses;

    private void Start()
    {
        hits = 0;
        misses = 0;
        updateText();
    }

    // Update is called once per frame
    private void Update()
    {
    }

    public void IncreaseHits()
    {
        hits++;
        updateText();
    }

    public void IncreaseMisses()
    {
        misses++;
        updateText();
    }

    private void updateText()
    {
        scoreBoard.text = "Hits: " + hits; //" + " | " + "Misses: " + misses;
    }
}
